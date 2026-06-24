import Anthropic from '@anthropic-ai/sdk'
import { generateText, stepCountIs } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import type { ModelMessage, Tool as AITool } from 'ai'
import { z } from 'zod'
import { redisClient }        from './session'
import { loadSkills, type SkillEntry } from './skills.registry'
import { embedText }          from './embedding.service'
import { internalClient }     from '../lib/internal'
import { userProfileService, formatProfileForPrompt } from './user-profile.service'
import { sanitizeInput, scanOutput, checkToolInput } from './guard.service'

// ── Types ─────────────────────────────────────────────────────────────────────

export type AIProvider = 'anthropic' | 'openai'

export interface UserAIConfig {
  provider: AIProvider
  model:    string
  apiKey:   string
}

type Channel = 'dassai-web' | 'dassai-seller-web'

// ── RAG context retrieval ─────────────────────────────────────────────────────

const RAG_ENABLED = !!process.env.OPENAI_API_KEY

async function retrieveContext(query: string, limit = 8): Promise<string> {
  if (!RAG_ENABLED) return ''
  try {
    const { vector } = await embedText(query)
    const results    = await internalClient.searchEmbeddings({ vector, limit, threshold: 0.45 })
    if (!results.length) return ''

    const lines = results.map((r) => {
      const m    = r.metadata as Record<string, any>
      const dist = r.distance.toFixed(3)
      if (r.entityType === 'PRODUCT') {
        return `[PRODUCT] ${m.title} — ₦${m.price}${m.discount ? ` (${m.discount}% off)` : ''} | Seller: ${m.sellerName ?? '?'} | In stock: ${m.inStock ? 'yes' : 'no'} | distance: ${dist}`
      }
      if (r.entityType === 'SELLER') {
        return `[SELLER] ${m.storeName} | ${m.locationLabel ?? m.city ?? ''} | Verified: ${m.isVerified ? 'yes' : 'no'} | distance: ${dist}`
      }
      return `[SQUARE] ${m.name} (${m.type}) | ${m.city ?? ''}, ${m.state ?? ''} | distance: ${dist}`
    })

    return `[Relevant context from MarketX]\n${lines.join('\n')}`
  } catch (err) {
    console.error('[rag] retrieval failed:', (err as Error).message)
    return ''
  }
}

// ── System prompts ────────────────────────────────────────────────────────────

function buildSystemPrompt(
  channel:     Channel,
  userProfile: string,
  ragContext:  string,
): string {
  const base = channel === 'dassai-seller-web' ? SELLER_BASE : BUYER_BASE

  const sections = [base]
  if (userProfile) sections.push(userProfile)
  if (ragContext)  sections.push(ragContext)

  return sections.join('\n\n')
}

const BUYER_BASE = `You are DasahAI, a sharp, friendly personal shopping assistant for MarketX — Nigeria's leading social commerce platform.
You know every seller, product, and market on the platform. You remember the user's size, style, and budget across sessions.

RULES:
1. Always explicitly ask for confirmation before generating a payment link.
2. Keep answers brief and conversational. Avoid formal language.
3. Never invent products or prices — always use your tools to search.
4. For shipping/delivery questions, use the logistics tool.
5. When a user wants to add something to their cart, use the cart tool with action=add.
6. When a user wants to view their cart, use the cart tool with action=view.
7. When a user wants to buy something directly, use the payment tool.
8. NEVER display product results as markdown tables or bullet lists — the UI renders product cards automatically. Just write a short intro sentence like "Here are some options I found:" and let the cards handle the rest.
9. When a user message contains "productId: <value>", extract that value and pass it directly to the cart tool as productId — do not search for the product again.
10. When you want to present the user with choices or next steps, use a bullet list (- option). Each bullet becomes a tappable button in the UI, so the user can tap instead of type. Only use bullets for actual selectable options, not for informational lists.
11. Use the [User Profile] section (when present) to give personalised recommendations — factor in their size, budget, and preferred style without them having to repeat it.
12. Use the [Relevant context from MarketX] section (when present) to recommend specific sellers or products by name rather than giving generic advice.
13. If the user's message is clearly a new topic (preferences, a different product, a question), drop the previous context and address it directly — do not keep referencing a failed cart operation.
14. Never ask the user for information you can fetch yourself (price, stock, product details). Always use your tools.
15. The search tool returns both "products" and "stores". If it finds no matching products but DOES return stores, tell the user about those store(s) by name and offer to show their products (e.g. "I couldn't find that as a product, but **Grandeur Wears and Abaya** specialises in it — want to see their items?"). The UI shows the store as a clickable card. Never say "nothing found" when a relevant store exists.
16. To show a specific store's products, use the view_store tool with that store's slug (from the prior search result). When a user message contains "storeSlug: <value>", extract that value and call view_store with it directly — do not search again. The UI renders the returned products as cards automatically.`

const SELLER_BASE = `You are DasahAI Seller Manager — a sharp, capable assistant that lets a MarketX seller run their entire store by chatting. You can do everything the seller dashboard does. You also have full buyer tools, so a seller can shop without switching mode.

YOUR SELLER TOOLS:
- seller_analytics — store performance: revenue, orders, units sold, product views, impressions, daily trend, and top products. Use for any "how's my store / sales / best sellers" question.
- store_management — the seller's products: list, create, update price, change status (DRAFT/PUBLISHED/ARCHIVED), set stock, archive.
- seller_orders — incoming store orders: list (optionally by status), view one, confirm/cancel, or mark shipped with a tracking number.
- seller_wallet — balance and earnings, transactions, payout preview, saved bank accounts, and withdrawals.
- store_profile — view or edit the store (name, description, phone, location) and activate/deactivate it.
- social_media — marketing campaigns.

RULES:
1. Never invent numbers, orders, products, or balances — always use a tool to fetch real data.
2. ALWAYS confirm before any action that changes money, state, or what buyers see (price, product/order status, shipping, archiving, store activation, withdrawals). To do this, call the tool with preview:true FIRST — it returns the real before→after (shown to the seller as a confirmation card) WITHOUT applying anything. Then wait for the seller's "yes" and call the tool again WITHOUT preview to apply it. Never apply a change in one step.
3. For a withdrawal: first show the available balance and the saved bank accounts, confirm the amount and account, then withdraw. Never withdraw without an explicit confirmation.
4. Money is in naira (₦). Tools already convert — just present the values.
5. NEVER dump raw JSON, markdown tables, or long bullet lists of data — the UI renders analytics charts, order cards, and product cards automatically. Write a short, friendly intro sentence ("Here's how your week looked:") and let the UI handle the data.
6. When offering choices or next steps, use a bullet list (- option) — each bullet becomes a tappable button. Only for actual selectable options, not for informational lists.
7. When a seller wants to find, buy, or add a product to their cart, use the buyer tools exactly as you would for a buyer.
8. Keep answers concise, warm, and action-oriented. Give one clear recommendation, not an essay.
9. OUTCOMES OF ACTIONS ARE NOT YOURS TO DECLARE. When a tool that changes data returns a result with "verified" and "display" fields, you MUST NOT state the result, numbers, or whether it worked in your own words — the UI shows a verified result card from the real data. Just relay the tool's "display" text (lightly rephrased is fine) and stop. If "success" is false, tell the seller plainly that it did NOT go through and relay the tool's "error" — NEVER invent a cause (e.g. do not guess "ID format" or "platform restriction"). If you did not get a tool result, say you're not sure it completed and offer to re-check — never assume success.`

// ── Conversation history (Redis) ──────────────────────────────────────────────

export interface HistoryEntry {
  role:    'user' | 'assistant'
  content: string
}

const HISTORY_PREFIX = 'history:'
const HISTORY_TTL    = 86400
const MAX_HISTORY    = 40

export async function getHistory(userId: string): Promise<HistoryEntry[]> {
  try {
    const raw = await redisClient.get(`${HISTORY_PREFIX}${userId}`)
    if (!raw) return []
    const parsed = JSON.parse(raw) as any[]
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

// ── Anthropic path ────────────────────────────────────────────────────────────

async function chatWithAnthropic(
  apiKey:  string,
  model:   string,
  system:  string,
  history: HistoryEntry[],
  skills:  SkillEntry[],
  userId:  string,
): Promise<{ content: string; toolsInvoked: string[]; toolResults: Record<string, unknown> }> {
  const client       = new Anthropic({ apiKey })
  const toolsInvoked: string[] = []
  const toolResults:  Record<string, unknown> = {}

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

    const toolResultBlocks: Anthropic.ToolResultBlockParam[] = []
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue

      // Guard: validate tool inputs
      if (!checkToolInput(block.name, block.input as Record<string, unknown>, userId)) {
        toolResultBlocks.push({
          type:        'tool_result',
          tool_use_id: block.id,
          content:     'Invalid input: entity ID format rejected by guard rail.',
        })
        continue
      }

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

// ── OpenAI path ───────────────────────────────────────────────────────────────

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
  apiKey:  string,
  model:   string,
  system:  string,
  history: HistoryEntry[],
  skills:  SkillEntry[],
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
    model:    openaiModel,
    system,
    messages,
    tools,
    stopWhen: stepCountIs(5),
  })

  const toolsInvoked = result.steps
    .flatMap((s) => s.toolCalls ?? [])
    .map((tc) => tc.toolName)

  return { content: result.text, toolsInvoked, toolResults: {} }
}

// ── Public API ────────────────────────────────────────────────────────────────

export const aiService = {
  async chat(params: {
    userId:       string
    content:      string
    channel:      Channel
    userToken:    string
    userAIConfig: UserAIConfig | null
    storeId?:     string
    storeSlug?:   string
    attachments?: Array<{ url: string; public_id: string; type?: string }>
  }): Promise<{ content: string; toolsInvoked: string[]; toolResults: Record<string, unknown>; guardBlocked: boolean; ragHits: number }> {
    const { userId, content, channel, userToken, userAIConfig, storeId, storeSlug, attachments } = params
    const startMs = Date.now()

    // 1. Guard: sanitize input
    const guard = sanitizeInput(userId, content)
    if (guard.blocked) {
      console.warn(`[ai.service] guard blocked uid=${userId}`)
      return {
        content:      "I'm not able to help with that. Let me know if there's something I can find for you on MarketX.",
        toolsInvoked: [],
        toolResults:  {},
        guardBlocked: true,
        ragHits:      0,
      }
    }
    const safeContent = guard.sanitized

    // 2. Load user AI profile (cache-first)
    const profile     = await userProfileService.getProfile(userId)
    const profileText = formatProfileForPrompt(profile)

    // 3. RAG: embed the user's query and retrieve relevant context
    const ragContext = await retrieveContext(safeContent)
    const ragHits    = ragContext ? ragContext.split('\n').filter((l) => l.startsWith('[')).length : 0

    // 4. Build system prompt
    const system = buildSystemPrompt(channel, profileText, ragContext)

    // 5. Load history and append sanitized user message. If the user attached
    // images, tell the model (the actual URLs stay in context — the model never
    // handles them) so it knows it can create/attach a product with them.
    const history = await getHistory(userId)
    const userMessage = attachments?.length
      ? `${safeContent}\n\n[The user attached ${attachments.length} image${attachments.length === 1 ? '' : 's'}. When creating a product, the image(s) are attached automatically — never ask for an image URL.]`
      : safeContent
    history.push({ role: 'user', content: userMessage })

    const skills   = loadSkills(channel, { userToken, storeId, storeSlug, attachments })
    const provider = userAIConfig?.provider ?? 'anthropic'
    const model    = userAIConfig?.model    ?? 'claude-sonnet-4-6'
    const apiKey   = userAIConfig?.apiKey   ?? process.env.ANTHROPIC_API_KEY ?? ''

    if (!apiKey) {
      throw new Error(`AI API key not configured (provider=${provider})`)
    }

    console.log(`[ai.service] calling provider=${provider} model=${model} skills=${skills.length} rag=${ragHits}`)

    let result: { content: string; toolsInvoked: string[]; toolResults: Record<string, unknown> }

    if (provider === 'openai') {
      result = await chatWithOpenAI(apiKey, model, system, history, skills)
    } else {
      result = await chatWithAnthropic(apiKey, model, system, history, skills, userId)
    }

    // 6. Guard: scan output for PII
    result.content = scanOutput(result.content)

    history.push({ role: 'assistant', content: result.content })
    await saveHistory(userId, history)

    const latencyMs = Date.now() - startMs
    console.log(`[ai.service] done latency=${latencyMs}ms tools=${result.toolsInvoked.join(',') || 'none'}`)

    // 7. Fire-and-forget: log turn + extract preferences
    internalClient.logTurn({
      userId,
      sessionId:         userId,
      channel,
      userMessage:       safeContent,
      assistantResponse: result.content,
      toolsCalled:       result.toolsInvoked,
      ragHits,
      latencyMs,
      modelUsed:         model,
      guardBlocked:      false,
    })

    userProfileService.extractAndUpdate(userId, safeContent, result.content)

    return { ...result, guardBlocked: false, ragHits }
  },

  async clearHistory(userId: string): Promise<void> {
    try {
      await redisClient.del(`${HISTORY_PREFIX}${userId}`)
    } catch {}
  },
}
