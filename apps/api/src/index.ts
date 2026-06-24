import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import helmet from 'helmet'
import { randomUUID } from 'crypto'
import jwt from 'jsonwebtoken'
import { redisClient, sessionStore } from './services/session'
import { aiService, getHistory } from './services/ai.service'
import { startIndexer } from './workers/indexer'
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

  socket.on('session:store', ({ storeId, storeName, storeSlug }) => {
    socket.data.storeId   = storeId
    socket.data.storeName = storeName
    socket.data.storeSlug = storeSlug
    console.log(`[Socket] user ${userId} selected store: ${storeName} (${storeId})`)
  })

  socket.on('chat:new', async () => {
    await aiService.clearHistory(userId)
    console.log(`[Socket] user ${userId} started new conversation`)
  })

  socket.on('chat:load', async ({ sessionId: targetSessionId }) => {
    // History is currently keyed by userId — targetSessionId is userId for now.
    // If they match, replay from Redis. Otherwise this is a no-op until per-session
    // history storage is implemented.
    if (targetSessionId === userId) {
      const history = await getHistory(userId)
      if (history.length) {
        socket.emit('chat:history', history.map((entry, i) => ({
          id:        `h-${i}`,
          sessionId: userId,
          role:      entry.role === 'assistant' ? 'bot' : ('user' as const),
          content:   entry.content,
          createdAt: new Date(),
        })))
      }
    }
    console.log(`[Socket] user ${userId} loaded conversation: ${targetSessionId}`)
  })

  socket.on('chat:send', async ({ content, attachments }) => {
    socket.emit('chat:typing', true)
    const reqId = randomUUID().slice(0, 8)

    try {
      await sessionStore.touch(userId).catch(() => {})

      const channel =
        socket.data.sessionType === 'seller' ? 'dassai-seller-web' : 'dassai-web'

      console.log(`[chat:${reqId}] start uid=${userId} channel=${channel} len=${content.length}`)

      const response = await aiService.chat({
        userId,
        content,
        channel,
        userToken:    session!.marketxToken,
        userAIConfig: session!.userAIConfig ?? null,
        storeId:      socket.data.storeId,
        storeSlug:    socket.data.storeSlug,
        attachments:  Array.isArray(attachments) ? attachments : undefined,
      })

      console.log(`[chat:${reqId}] ok tools=${response.toolsInvoked.join(',') || 'none'} rag=${response.ragHits} blocked=${response.guardBlocked}`)

      const metadata = buildMessageMetadata(response.toolsInvoked, response.toolResults, channel, response.content)

      // Guard: the authoritative outcome wins over the agent's prose. If a mutation
      // failed verification, replace the message text with the verified failure line
      // so the agent can never narrate a success (or a fabricated cause) that didn't
      // happen. The result card already shows the truth; this keeps the words honest too.
      let outContent = response.content
      const ar = metadata.actionResult as { success?: boolean; display?: string } | undefined
      if (ar && ar.success === false && ar.display) outContent = ar.display

      socket.emit('chat:typing', false)
      socket.emit('chat:message', {
        id:        randomUUID(),
        sessionId: userId,
        role:      'bot',
        content:   outContent,
        metadata,
        createdAt: new Date(),
      })
    } catch (err: any) {
      socket.emit('chat:typing', false)
      socket.emit('chat:message', {
        id:        randomUUID(),
        sessionId: userId,
        role:      'system',
        content:   'Something went wrong. Please try again.',
        createdAt: new Date(),
      })
      console.error(`[chat:${reqId}] ERROR uid=${userId}`, {
        message: err?.message,
        status:  err?.status ?? err?.statusCode,
        type:    err?.error?.type ?? err?.name,
        stack:   err?.stack?.split('\n').slice(0, 5).join(' | '),
      })
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
      id:        randomUUID(),
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

function extractBulletOptions(text: string): string[] {
  return text
    .split('\n')
    .filter((l) => /^[-*]\s+.+/.test(l.trim()))
    .map((l) => l.trim().replace(/^[-*]\s+/, '').replace(/\*\*/g, '').trim())
    .filter((l) => l.length > 0 && l.length < 60)
    .slice(0, 4)
}

function buildMessageMetadata(
  toolsInvoked: string[],
  toolResults: Record<string, unknown>,
  channel: string,
  responseContent = '',
): Record<string, unknown> {
  const meta: Record<string, unknown> = { toolsInvoked }

  // Products from marketplace search
  const marketxResult = toolResults['marketx'] as { products?: unknown[]; stores?: unknown[]; total?: number } | undefined
  if (marketxResult?.products?.length) {
    meta.products = marketxResult.products
  }
  // Stores surfaced by search (e.g. "abaya" → the store that sells it) — render
  // as clickable store cards so the user can open the profile or browse products.
  if (marketxResult?.stores?.length) {
    meta.stores = marketxResult.stores
  }

  // view_store — a specific store's profile + its products (clicked from a store card)
  const viewStore = toolResults['view_store'] as { store?: unknown; products?: unknown[] } | undefined
  if (viewStore?.store) meta.stores = meta.stores ?? [viewStore.store]
  if (viewStore?.products?.length) meta.products = meta.products ?? viewStore.products

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

  // Products from deals feed
  const dealsResult = toolResults['deals'] as { products?: unknown[]; total?: number } | undefined
  if (dealsResult?.products?.length) {
    meta.products = meta.products ?? dealsResult.products
    meta.isDeals = true
  }

  // Products from trending feed
  const trendingResult = toolResults['trending'] as { products?: unknown[]; total?: number } | undefined
  if (trendingResult?.products?.length) {
    meta.products = meta.products ?? trendingResult.products
    meta.isTrending = true
  }

  // Order history / single order
  const ordersResult = toolResults['orders'] as
    | { orders?: unknown[]; order?: unknown; total?: number }
    | undefined
  if (ordersResult) {
    if (ordersResult.order) {
      meta.orderDetail = ordersResult.order
    } else if (ordersResult.orders) {
      meta.orders = ordersResult.orders
    }
  }

  // Wallet balance
  const walletResult = toolResults['wallet'] as
    | { balance?: number; pendingBalance?: number; currency?: string; transactions?: unknown[] }
    | undefined
  if (walletResult) {
    meta.wallet = walletResult
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

  // Seller: product management → render as product cards
  const storeMgmt = toolResults['store_management'] as { products?: any[]; kind?: string } | undefined
  if (storeMgmt?.products?.length) {
    meta.products = meta.products ?? storeMgmt.products.map((p) => ({
      id: p.id, name: p.title, price: p.price, currency: 'NGN',
      imageUrl: p.thumbnail, slug: p.slug, status: p.status, inStock: true,
    }))
    meta.sellerProducts = true
  }

  // Verified mutation result (set_stock, price, status, …) — the AUTHORITATIVE outcome,
  // rendered by the UI from read-after-write data, not from the agent's prose. A
  // `preview` is the grounded before→after shown for confirmation (nothing applied yet).
  for (const r of Object.values(toolResults)) {
    const m = r as { kind?: string } | undefined
    if (m?.kind === 'mutation') { meta.actionResult = m; break }
    if (m?.kind === 'preview')  { meta.actionPreview = m; break }
  }

  // Seller: incoming store orders
  const sellerOrders = toolResults['seller_orders'] as { orders?: unknown[] } | undefined
  if (sellerOrders?.orders) meta.orders = meta.orders ?? sellerOrders.orders

  // Seller: wallet (balance / transactions / bank accounts)
  const sellerWallet = toolResults['seller_wallet'] as Record<string, unknown> | undefined
  if (sellerWallet && (sellerWallet.available !== undefined || sellerWallet.accounts || sellerWallet.transactions)) {
    meta.wallet = meta.wallet ?? sellerWallet
  }

  // Quick replies — prefer bullet options from the response, fall back to context-driven
  meta.quickReplies = deriveQuickReplies(toolsInvoked, meta, channel, responseContent)

  return meta
}

// Detects when the bot is asking the user to confirm a pending action
// ("Just to confirm…", "Shall I go ahead?", "go ahead and save this?").
function isConfirmationPrompt(text: string): boolean {
  return /\bgo ahead\b|just to confirm|shall i (save|update|proceed)|should i (save|update|proceed)/i.test(text)
}

function deriveQuickReplies(
  toolsInvoked: string[],
  meta: Record<string, unknown>,
  channel: string,
  responseContent = '',
): string[] {
  // If the model wrote its own options as bullets, MarkdownText already renders them
  // as tappable chips — so we must NOT repeat them here (that produced duplicate
  // buttons). When there are no bullets but the bot is asking for confirmation,
  // offer Yes/No so the user can tap instead of typing "yes".
  const bullets = extractBulletOptions(responseContent)
  if (bullets.length) return []
  if (isConfirmationPrompt(responseContent)) return ['Yes, go ahead', 'No, cancel']

  if (channel === 'dassai-seller-web') {
    // Seller-specific tools take priority
    if (toolsInvoked.includes('seller_analytics')) return ['This month', 'Today', 'All time', 'Show orders']
    if (toolsInvoked.includes('store_management')) return ['View inventory', 'Check analytics', 'Run campaign']
    // Seller also invoked buyer tools (shopping) — use buyer replies
    if (meta.products)    return ['Show more results', 'Add to cart', 'View cart', 'Search something else']
    if (meta.cart)        return ['Checkout', 'Remove item', 'Continue shopping']
    if (meta.cartUpdate)  return ['View cart', 'Checkout now', 'Continue shopping']
    return ['View analytics', 'Manage inventory', 'View orders']
  }

  if (meta.isDeals)      return ['Add to cart', 'View cart', 'Show more deals', 'Search products']
  if (meta.isTrending)   return ['Add to cart', 'View cart', 'Search products', 'View deals']
  if (meta.products)     return ['Show more results', 'Filter by price', 'View cart', 'Search something else']
  if (meta.cart)         return ['Checkout', 'Remove item', 'Continue shopping']
  if (meta.cartUpdate)   return ['View cart', 'Checkout now', 'Continue shopping']
  if (meta.orderDetail)  return ['Track this order', 'Contact support', 'View all orders']
  if (meta.orders)       return ['View order details', 'Track my order', 'Contact support']
  if (meta.wallet)       return ['Add funds', 'View transactions', 'View orders', 'View cart']
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

  httpServer.listen(PORT, () => {
    console.log(`[API] listening on :${PORT}`)
    startIndexer()
  })
}

main().catch((err) => {
  console.error('[API] startup error:', err)
  process.exit(1)
})
