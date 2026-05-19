import { ref } from 'vue'
import { useSocket } from './useSocket'

export interface ProductItem {
  id: string | number
  name: string
  price: number
  currency: string
  seller?: string
  imageUrl?: string
  inStock: boolean
  slug?: string
}

export interface CartState {
  items: unknown[]
  subtotal: number
  count: number
}

export interface ChatMessageMetadata {
  toolsInvoked?: string[]
  products?: ProductItem[]
  cart?: CartState
  cartUpdate?: { success: boolean; message: string }
  orderTracking?: unknown
  analytics?: unknown
  quickReplies?: string[]
}

export interface ChatMessage {
  id: string
  sessionId?: string
  role: 'user' | 'bot' | 'system'
  content: string
  metadata?: ChatMessageMetadata
  createdAt: string | Date
}

export const useChat = () => {
  const { socket } = useSocket()
  const messages = ref<ChatMessage[]>([])
  const isTyping = ref(false)
  const sessionId = ref<string | null>(null)

  const setupListeners = () => {
    if (!socket.value) return

    socket.value.off('chat:history')
    socket.value.off('chat:message')
    socket.value.off('chat:typing')
    socket.value.off('error')

    socket.value.on('chat:history', (history: ChatMessage[]) => {
      messages.value = history
    })

    socket.value.on('chat:message', (msg: ChatMessage) => {
      messages.value.push(msg)
      if ((msg as any).sessionId && !sessionId.value) {
        sessionId.value = (msg as any).sessionId
      }
    })

    socket.value.on('chat:typing', (status: boolean) => {
      isTyping.value = status
    })

    socket.value.on('error', (err: { message: string }) => {
      messages.value.push({
        id: Date.now().toString(),
        role: 'system',
        content: err.message,
        createdAt: new Date()
      })
    })
  }

  const sendMessage = (content: string) => {
    if (!socket.value || !content.trim()) return

    messages.value.push({
      id: Date.now().toString(),
      role: 'user',
      content,
      createdAt: new Date()
    })

    socket.value.emit('chat:send', {
      content,
      sessionId: sessionId.value
    })
  }

  const approvePayment = (approvalToken: string) => {
    if (!socket.value) return
    socket.value.emit('payment:approve', {
      approvalToken,
      sessionId: sessionId.value
    })
  }

  const clearMessages = () => {
    messages.value = []
    sessionId.value = null
  }

  return { messages, isTyping, sessionId, setupListeners, sendMessage, approvePayment, clearMessages }
}
