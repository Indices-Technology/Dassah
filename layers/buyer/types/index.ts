export type MessageRole = 'user' | 'bot' | 'system'

export interface OrderUpdate {
  orderId: string
  status: 'pending_approval' | 'processing' | 'confirmed' | 'shipped' | 'delivered' | 'disputed' | 'refunded' | 'cancelled'
  message: string
  trackingNumber?: string
  estimatedDelivery?: string
}

export interface AuthState {
  userId: string | null
  sessionId: string | null
  token: string | null
}
