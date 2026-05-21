import Anthropic from '@anthropic-ai/sdk'
import { generateText, tool, stepCountIs } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import type { ModelMessage, Tool as AITool } from 'ai'
import { z } from 'zod'
import { redisClient } from './session'
import { loadSkills, type SkillEntry } from './skills.registry'

// ── Types ─────────────────────────────────────────────────────────────────────

export type AIProvider = 'anthropic' | 'openai'

export interface UserAIConfig {
  provider: AIProvider
  model: string
  apiKey: string
}

type Channel = 'dassai-web' | 'dassai-seller-web'

// ── System prompts ────────────────────────────────────────────────────────────

const SYSTEM_PROMPTS: Record<Channel, string> = {
  'dassai-web': `You are DassaAI, a helpful, concise, and friendly shopping assistant for MarketX.
Your goal is to help users find products, manage their cart, purchase items, track orders, and resolve disputes.

RULES:
1. Always explicitly ask for confirmation before generating a payment link.
2. Keep answers brief and conversational. Avoid formal language.
3. Never invent products or shipping prices — always use your tools to search.
4. For shipping/delivery questions, use the logistics tool.
5. When a user wants to add something to their cart, use the cart tool with action=add.
6. When a user wants to view their cart, use the cart tool with action=view.
7. When a user wants to buy something directly, use the payment tool.
8. NEVER display product results as markdown tables or bullet lists — the UI renders product cards automatically. Just write a short intro sentence like "Here are some options I found:" and let the cards handle the rest.
9. When a user message contains "productId: <value>", extract that value and pass it directly to the cart tool as productId — do not search for the product again.
10. When you want to present the user with choices or next steps, use a bullet list (- option). Each bullet becomes a tappable button in the UI, so the user can tap instead of type. Only use bullets for actual selectable options, not for informational lists.`,

  'dassai-seller-web': `You are DassaAI Seller Manager, a powerful AI assistant for MarketX sellers.
Your goal is to help sellers manage their stores, view analytics, run campaigns, and handle orders.

RULES:
1. Provide actionable insights from analytics data.
2. Help sellers optimise inventory and pricing.
3. Assist with social media campaigns.
4. Keep answers concise and data-driven.
5. Use store_management for inventory/price updates.
6. Use seller_analytics for performance queries.
7. Use social_media for marketing campaigns.
8. When you want to present the user with choices or next steps, use a bullet list (- option). Each bullet becomes a tappable button in the UI. Only use bullets for actual selectable options, not for informational lists.`,
}

// ── Conversation history (Redis) ──────────────────────────────────────────────

export interface HistoryEntry {
  role: 'user' | 'assistant'
  content: string
}

const HISTORY_PREFIX = 'history:'
const HISTORY_TTL    = 86400   // 24 hours — persists across same-day sessions
const MAX_HISTORY    = 40

export async function getHistory(userId: string): Promise<HistoryEntry[]> {
  try {
    const raw = await redisClient.get(`${HISTORY_PREFIX}${userId}`)
    if (!raw) return []
    const parsed = JSON.parse(raw) as any[]
    // Normalise: handles both old CoreMessage[] format and new HistoryEntry[] format
    return parsed
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({
        role:    m.role as 'user' | 'assistant',
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      }))
  } catch {
    return []
  }
}

async function saveHistory(userId: string, messages: HistoryEntry[]): Promise<void> {
  try {
    await redisClient.set(
      `${HISTORY_PREFIX}${userId}`,
      JSON.stringify(messages.slice(-MAX_HISTORY)),
      'EX',
      HISTORY_TTL,
    )
  } catch {}
}

// ── Anthropic path (native SDK — bypasses broken @ai-sdk/anthropic) ───────────

async function chatWithAnthropic(
  apiKey: string,
  model: string,
  system: string,
  history: HistoryEntry[],
  skills: SkillEntry[],
): Promise<{ content: string; toolsInvoked: string[]; toolResults: Record<string, unknown> }> {
  const client = new Anthropic({ apiKey })
  const toolsInvoked: string[] = []
  const toolResults: Record<string, unknown> = {}

  // Pass skill parameters directly as input_schema — already JSON Schema objects
  const tools: Anthropic.Tool[] = skills.map((s) => ({
    name:         s.name,
    description:  s.description,
    input_schema: s.parameters as Anthropic.Tool['input_schema'],
  }))

  const messages: Anthropic.MessageParam[] = history.map(({ role, content }) => ({ role, content }))

  for (let step = 0; step < 5; step++) {
    const response = await client.messages.create({
      model,
      max_tokens: 4096,
      system,
      messages,
      ...(tools.length > 0 ? { tools } : {}),
    })

    messages.push({ role: 'assistant', content: response.content })

    if (response.stop_reason !== 'tool_use') {
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')
      return { content: text, toolsInvoked, toolResults }
    }

    // Execute tool calls and collect results
    const toolResultBlocks: Anthropic.ToolResultBlockParam[] = []
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue
      toolsInvoked.push(block.name)

      const skill = skills.find((s) => s.name === block.name)
      if (!skill) {
        toolResultBlocks.push({ type: 'tool_result', tool_use_id: block.id, content: 'Tool not found' })
        continue
      }

      try {
        const result = await skill.execute(block.input as Record<string, unknown>)
        toolResults[block.name] = result
        toolResultBlocks.push({
          type:        'tool_result',
          tool_use_id: block.id,
          content:     typeof result === 'string' ? result : JSON.stringify(result),
        })
      } catch (err: any) {
        toolResultBlocks.push({ type: 'tool_result', tool_use_id: block.id, content: `Error: ${err.message}` })
      }
    }

    messages.push({ role: 'user', content: toolResultBlocks })
  }

  return { content: '', toolsInvoked, toolResults }
}

// ── OpenAI path (Vercel AI SDK) ───────────────────────────────────────────────

function toZod(schema: Record<string, any>): z.ZodTypeAny {
  if (schema.enum) {
    const vals = schema.enum as [string, ...string[]]
    const s = z.enum(vals)
    return schema.description ? s.describe(schema.description) : s
  }
  if (schema.type === 'string') {
    const s = z.string()
    return schema.description ? s.describe(schema.description) : s
  }
  if (schema.type === 'number') {
    const s = z.number()
    return schema.description ? s.describe(schema.description) : s
  }
  if (schema.type === 'object') {
    const required: string[] = schema.required ?? []
    const shape: Record<string, z.ZodTypeAny> = {}
    for (const [key, val] of Object.entries(schema.properties ?? {})) {
      const field = toZod(val as Record<string, any>)
      shape[key] = required.includes(key) ? field : field.optional()
    }
    return z.object(shape)
  }
  return z.unknown()
}

async function chatWithOpenAI(
  apiKey: string,
  model: string,
  system: string,
  history: HistoryEntry[],
  skills: SkillEntry[],
): Promise<{ content: string; toolsInvoked: string[]; toolResults: Record<string, unknown> }> {
  const openaiModel = createOpenAI({ apiKey })(model)

  const tools: Record<string, AITool<any, any>> = {}
  for (const skill of skills) {
    tools[skill.name] = {
      description: skill.description,
      inputSchema: toZod(skill.parameters) as any,
      execute:     async (args: any) => skill.execute(args as Record<string, unknown>),
    } as unknown as AITool<any, any>
  }

  const messages: ModelMessage[] = history.map(({ role, content }) => ({ role, content }))

  const result = await generateText({
    model:     openaiModel,
    system,
    messages,
    tools,
    stopWhen:  stepCountIs(5),
  })

  const toolsInvoked = result.steps
    .flatMap((s) => s.toolCalls ?? [])
    .map((tc) => tc.toolName)

  return { content: result.text, toolsInvoked, toolResults: {} }
}

// ── Public API ────────────────────────────────────────────────────────────────

export const aiService = {
  async chat(params: {
    userId: string
    content: string
    channel: Channel
    userToken: string
    userAIConfig: UserAIConfig | null
  }): Promise<{ content: string; toolsInvoked: string[]; toolResults: Record<string, unknown> }> {
    const { userId, content, channel, userToken, userAIConfig } = params

    const history = await getHistory(userId)
    history.push({ role: 'user', content })

    const skills = loadSkills(channel, { userToken })

    const provider = userAIConfig?.provider ?? 'anthropic'
    const model    = userAIConfig?.model    ?? 'claude-sonnet-4-6'
    const apiKey   = userAIConfig?.apiKey   ?? process.env.ANTHROPIC_API_KEY!

    let result: { content: string; toolsInvoked: string[]; toolResults: Record<string, unknown> }

    if (provider === 'openai') {
      result = await chatWithOpenAI(apiKey, model, SYSTEM_PROMPTS[channel], history, skills)
    } else {
      result = await chatWithAnthropic(apiKey, model, SYSTEM_PROMPTS[channel], history, skills)
    }

    history.push({ role: 'assistant', content: result.content })
    await saveHistory(userId, history)

    return result
  },

  async clearHistory(userId: string): Promise<void> {
    try {
      await redisClient.del(`${HISTORY_PREFIX}${userId}`)
    } catch {}
  },
}
