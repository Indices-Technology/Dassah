// ─────────────────────────────────────────────────────────────────────────────
// Shared TypeScript types for the DassaAI API
// ─────────────────────────────────────────────────────────────────────────────

// MarketX JWT payload — must match what MarketX signs: { userId, email, role }
export interface MarketXUser {
  userId: string
  email: string
  role: string
}

declare global {
  namespace Express {
    interface Request {
      user?: MarketXUser
    }
  }
}

// ── Chat / Messaging ──────────────────────────────────────────────────────────

export type MessageRole = 'user' | 'bot' | 'system'

export interface ChatMessage {
  id: string
  sessionId: string
  role: MessageRole
  content: string
  metadata?: Record<string, unknown>
  createdAt: Date
}

// ── Socket.IO Events ──────────────────────────────────────────────────────────

export interface ServerToClientEvents {
  'chat:history': (messages: ChatMessage[]) => void
  'chat:message': (message: ChatMessage) => void
  'chat:typing': (isTyping: boolean) => void
  'order:update': (update: OrderUpdate) => void
  'payment:prompt': (prompt: PaymentPrompt) => void
}

export interface ClientToServerEvents {
  'session:type': (type: 'buyer' | 'seller') => void
  'session:store': (payload: { storeId: string; storeName: string; storeSlug: string }) => void
  'chat:send': (payload: { content: string; sessionId: string; attachments?: Array<{ url: string; public_id: string; type?: string }> }) => void
  'chat:new': () => void
  'chat:load': (payload: { sessionId: string }) => void
  'payment:approve': (payload: { approvalToken: string; sessionId: string }) => void
}

// ── Orders ────────────────────────────────────────────────────────────────────

export type OrderStatus =
  | 'pending_approval'
  | 'processing'
  | 'confirmed'
  | 'shipped'
  | 'delivered'
  | 'disputed'
  | 'refunded'
  | 'cancelled'

export interface OrderUpdate {
  orderId: string
  status: OrderStatus
  message: string
  trackingNumber?: string
  estimatedDelivery?: string
}

// ── Payment ───────────────────────────────────────────────────────────────────

export interface PaymentPrompt {
  approvalToken: string
  productName: string
  price: number
  currency: string
  checkoutUrl: string
  expiresAt: Date
}

// ── OpenClaw ──────────────────────────────────────────────────────────────────

export interface OpenClawChatParams {
  userId: string
  content: string
  channel: 'dassai-web' | 'dassai-seller-web'
  userToken: string
}

export interface OpenClawChatResult {
  content: string
  toolsInvoked: string[]
}
