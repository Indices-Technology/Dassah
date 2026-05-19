import Anthropic from '@anthropic-ai/sdk'
import type { MessageParam, ToolUseBlock } from '@anthropic-ai/sdk/resources/messages'
import { redisClient } from './session'
import { getTools, executeSkill } from './skillRegistry'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const HISTORY_PREFIX = 'history:'
const HISTORY_TTL    = 3600   // 1 hour
const MAX_HISTORY    = 40     // cap context size
const MAX_TOOL_ITER  = 5      // max tool-call rounds per message

// ── System prompts ────────────────────────────────────────────────────────────

const SYSTEM_PROMPTS: Record<Channel, string> = {
  'dassai-web': `You are DassaAI, a helpful, concise, and friendly shopping assistant for MarketX.
Your goal is to help users find products, purchase them, track their orders, and resolve disputes.

RULES:
1. Always explicitly ask for confirmation before generating a payment link.
2. Keep answers brief and conversational. Avoid formal language.
3. Never invent products or shipping prices — always use your tools to search.
4. For shipping/delivery questions, use the logistics tool.
5. When a user wants to buy something, use the payment tool.`,

  'dassai-seller-web': `You are DassaAI Seller Manager, a powerful AI assistant for MarketX sellers.
Your goal is to help sellers manage their stores, view analytics, run campaigns, and handle orders.

RULES:
1. Provide actionable insights from analytics data.
2. Help sellers optimise inventory and pricing.
3. Assist with social media campaigns.
4. Keep answers concise and data-driven.
5. Use store_management for inventory/price updates.
6. Use seller_analytics for performance queries.
7. Use social_media for marketing campaigns.`,
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Channel = 'dassai-web' | 'dassai-seller-web'

// ── Conversation history (Redis) ──────────────────────────────────────────────

async function getHistory(userId: string): Promise<MessageParam[]> {
  try {
    const raw = await redisClient.get(`${HISTORY_PREFIX}${userId}`)
    return raw ? (JSON.parse(raw) as MessageParam[]) : []
  } catch {
    return []
  }
}

async function saveHistory(userId: string, messages: MessageParam[]): Promise<void> {
  try {
    await redisClient.set(
      `${HISTORY_PREFIX}${userId}`,
      JSON.stringify(messages.slice(-MAX_HISTORY)),
      'EX',
      HISTORY_TTL,
    )
  } catch {}
}

// ── Public API ────────────────────────────────────────────────────────────────

export const openclawClient = {
  async chat(params: {
    userId: string
    content: string
    channel: Channel
    userToken: string
  }): Promise<{ content: string; toolsInvoked: string[] }> {
    const { userId, content, channel, userToken } = params

    const history = await getHistory(userId)
    history.push({ role: 'user', content })

    const tools        = getTools(channel)
    const toolsInvoked: string[] = []

    for (let i = 0; i < MAX_TOOL_ITER; i++) {
      const response = await anthropic.messages.create({
        model:      'claude-sonnet-4-6',
        max_tokens: 4096,
        system:     SYSTEM_PROMPTS[channel],
        tools,
        messages:   history,
      })

      history.push({ role: 'assistant', content: response.content })

      if (response.stop_reason !== 'tool_use') {
        await saveHistory(userId, history)
        const textBlock = response.content.find((b) => b.type === 'text')
        return { content: textBlock?.type === 'text' ? textBlock.text : '', toolsInvoked }
      }

      // Execute all tool calls in parallel
      const toolUseBlocks = response.content.filter((b): b is ToolUseBlock => b.type === 'tool_use')
      const toolResults = await Promise.all(
        toolUseBlocks.map(async (call) => {
          toolsInvoked.push(call.name)
          let result: unknown
          try {
            result = await executeSkill(
              call.name,
              call.input as Record<string, unknown>,
              { userToken },
            )
          } catch (err: any) {
            result = { error: err.message }
          }
          return {
            type: 'tool_result' as const,
            tool_use_id: call.id,
            content: JSON.stringify(result),
          }
        }),
      )

      history.push({ role: 'user', content: toolResults })
    }

    await saveHistory(userId, history)
    return {
      content: "I'm having trouble completing that request right now. Please try again.",
      toolsInvoked,
    }
  },

  async clearHistory(userId: string): Promise<void> {
    try {
      await redisClient.del(`${HISTORY_PREFIX}${userId}`)
    } catch {}
  },
}
