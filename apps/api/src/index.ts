import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import helmet from 'helmet'
import jwt from 'jsonwebtoken'
import { redisClient, sessionStore } from './services/session'
import { aiService, getHistory } from './services/ai.service'
import type { UserAIConfig } from './services/ai.service'
import { orderQueue } from './services/queue'
import type { ServerToClientEvents, ClientToServerEvents } from './types'

const app = express()
const httpServer = createServer(app)

app.use(helmet())
app.use(cors({ origin: process.env.NUXT_PUBLIC_API_URL ?? '*' }))
app.use(express.json())

app.get('/api/health', (_req, res) => res.json({ ok: true }))

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: '*' },
})

// ── Auth middleware ────────────────────────────────────────────────────────────

io.use((socket, next) => {
  const token = socket.handshake.auth.token as string | undefined
  if (!token) return next(new Error('Authentication error: token required'))

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
      userId: string
      email: string
      role: string
    }

    if (!decoded.userId) {
      return next(new Error('Authentication error: invalid token payload'))
    }

    socket.data.userId = decoded.userId
    socket.data.email  = decoded.email
    socket.data.role   = decoded.role
    next()
  } catch {
    next(new Error('Authentication error: invalid or expired token'))
  }
})

// ── Connection handler ────────────────────────────────────────────────────────

io.on('connection', async (socket) => {
  const { userId }      = socket.data
  const marketxToken    = socket.handshake.auth.token as string

  console.log(`[Socket] connected: ${socket.id} (user: ${userId})`)

  // Persist/refresh the session — no OpenClaw session creation needed anymore;
  // conversation history is stored in Redis keyed by userId.
  let session = await sessionStore.get(userId).catch(() => null)

  // Fetch user's own AI config (if any) — falls back to platform default when null
  const userAIConfig = await fetchUserAIConfig(marketxToken)

  if (!session) {
    session = { userId, marketxToken, userAIConfig, createdAt: new Date().toISOString() }
    await sessionStore.set(userId, session).catch(() => {})
  } else {
    session.marketxToken = marketxToken
    session.userAIConfig = userAIConfig
    await sessionStore.set(userId, session).catch(() => {})
  }

  // ── Replay history to newly connected client ─────────────────────────────

  const priorHistory = await getHistory(userId)
  if (priorHistory.length) {
    socket.emit('chat:history', priorHistory.map((entry, i) => ({
      id:        `h-${i}`,
      sessionId: userId,
      role:      entry.role === 'assistant' ? 'bot' : 'user',
      content:   entry.content,
      createdAt: new Date(),
    })))
  }

  // ── Events ───────────────────────────────────────────────────────────────

  socket.on('session:type', (type) => {
    socket.data.sessionType = type
    console.log(`[Socket] user ${userId} switched to: ${type}`)
  })

  socket.on('chat:send', async ({ content }) => {
    socket.emit('chat:typing', true)

    try {
      await sessionStore.touch(userId).catch(() => {})

      const channel =
        socket.data.sessionType === 'seller' ? 'dassai-seller-web' : 'dassai-web'

      const response = await aiService.chat({
        userId,
        content,
        channel,
        userToken:    session!.marketxToken,
        userAIConfig: session!.userAIConfig ?? null,
      })

      const metadata = buildMessageMetadata(response.toolsInvoked, response.toolResults, channel)

      socket.emit('chat:typing', false)
      socket.emit('chat:message', {
        id:        crypto.randomUUID(),
        sessionId: userId,
        role:      'bot',
        content:   response.content,
        metadata,
        createdAt: new Date(),
      })
    } catch (err) {
      socket.emit('chat:typing', false)
      socket.emit('chat:message', {
        id:        crypto.randomUUID(),
        sessionId: userId,
        role:      'system',
        content:   'Something went wrong. Please try again.',
        createdAt: new Date(),
      })
      console.error('[Socket] chat:send error:', err)
    }
  })

  socket.on('payment:approve', async ({ approvalToken }) => {
    if (!approvalToken || !session) return

    await orderQueue.add('process-order', {
      approvalToken,
      sessionId: userId,
      userId,
      socketId: socket.id,
      token:    session.marketxToken,
    })

    socket.emit('chat:message', {
      id:        crypto.randomUUID(),
      sessionId: userId,
      role:      'system',
      content:   'Payment confirmed. Processing your order…',
      createdAt: new Date(),
    })
  })

  // ── Redis pub/sub: worker → socket notifications ──────────────────────────

  try {
    const sub = redisClient.duplicate()
    await sub.connect()
    await sub.subscribe(`notify:${userId}`)

    sub.on('message', (_channel, message) => {
      try {
        socket.emit('chat:message', JSON.parse(message))
      } catch {
        console.error('[Socket] invalid notification payload')
      }
    })

    socket.on('disconnect', () => {
      console.log(`[Socket] disconnected: ${socket.id}`)
      sub.quit().catch(() => {})
    })
  } catch {
    console.warn('[Socket] Redis pub/sub unavailable — notifications disabled')
    socket.on('disconnect', () => console.log(`[Socket] disconnected: ${socket.id}`))
  }
})

// ── Boot ──────────────────────────────────────────────────────────────────────

// ── Metadata builder ──────────────────────────────────────────────────────────

function buildMessageMetadata(
  toolsInvoked: string[],
  toolResults: Record<string, unknown>,
  channel: string,
): Record<string, unknown> {
  const meta: Record<string, unknown> = { toolsInvoked }

  // Products from marketplace search
  const marketxResult = toolResults['marketx'] as { products?: unknown[]; total?: number } | undefined
  if (marketxResult?.products?.length) {
    meta.products = marketxResult.products
  }

  // Cart state
  const cartResult = toolResults['cart'] as
    | { items?: unknown[]; subtotal?: number; count?: number; success?: boolean; message?: string; variantId?: unknown; cartItem?: unknown }
    | undefined
  if (cartResult) {
    if (cartResult.items !== undefined) {
      // view action
      meta.cart = { items: cartResult.items, subtotal: cartResult.subtotal, count: cartResult.count }
    } else if (cartResult.success !== undefined) {
      // add/remove action
      meta.cartUpdate = { success: cartResult.success, message: cartResult.message }
    }
  }

  // Order tracking result
  const trackerResult = toolResults['tracker']
  if (trackerResult) {
    meta.orderTracking = trackerResult
  }

  // Seller analytics
  const analyticsResult = toolResults['seller_analytics']
  if (analyticsResult) {
    meta.analytics = analyticsResult
  }

  // Quick replies — context-driven
  meta.quickReplies = deriveQuickReplies(toolsInvoked, meta, channel)

  return meta
}

function deriveQuickReplies(
  toolsInvoked: string[],
  meta: Record<string, unknown>,
  channel: string,
): string[] {
  if (channel === 'dassai-seller-web') {
    if (toolsInvoked.includes('seller_analytics')) return ['This month', 'Today', 'All time', 'Show orders']
    if (toolsInvoked.includes('store_management')) return ['View inventory', 'Check analytics', 'Run campaign']
    return ['View analytics', 'Manage inventory', 'View orders']
  }

  if (meta.products) return ['Show more results', 'Filter by price', 'View cart', 'Search something else']
  if (meta.cart)      return ['Checkout', 'Remove item', 'Continue shopping']
  if (meta.cartUpdate) return ['View cart', 'Checkout now', 'Continue shopping']
  if (meta.orderTracking) return ['Contact support', 'View all orders']
  return ['Browse products', 'View cart', 'Track my order']
}

// ── Fetch user AI config from MarketX (server-to-server) ─────────────────────

async function fetchUserAIConfig(marketxToken: string): Promise<UserAIConfig | null> {
  try {
    const res = await fetch(`${process.env.MARKETX_API_URL}/api/user/ai-config`, {
      headers: {
        Authorization:      `Bearer ${marketxToken}`,
        'x-dassah-internal': process.env.MARKETX_API_KEY ?? '',
      },
    })
    if (!res.ok) return null
    const data = await res.json() as { configured: boolean; provider?: string; model?: string; apiKey?: string }
    if (!data.configured || !data.provider || !data.model || !data.apiKey) return null
    return { provider: data.provider as UserAIConfig['provider'], model: data.model, apiKey: data.apiKey }
  } catch {
    return null
  }
}

const PORT = parseInt(process.env.PORT ?? '4000', 10)

async function main() {
  try {
    await redisClient.connect()
    console.log('[Redis] connected')

    try {
      const { createAdapter } = await import('@socket.io/redis-adapter')
      const pub = redisClient.duplicate()
      const sub = redisClient.duplicate()
      await Promise.all([pub.connect(), sub.connect()])
      io.adapter(createAdapter(pub, sub))
      console.log('[Socket.IO] Redis adapter active')
    } catch {
      console.warn('[Socket.IO] Redis adapter unavailable — using in-memory')
    }
  } catch (err) {
    console.warn('[Redis] unavailable — in-memory sessions only:', (err as Error).message)
  }

  httpServer.listen(PORT, () => console.log(`[API] listening on :${PORT}`))
}

main().catch((err) => {
  console.error('[API] startup error:', err)
  process.exit(1)
})
