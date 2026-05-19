import { ref } from 'vue'
import { io, Socket } from 'socket.io-client'
import { useRuntimeConfig } from '#app'

const socket = ref<Socket | null>(null)
const isConnected = ref(false)

export const useSocket = () => {
  const config = useRuntimeConfig()

  const connect = (token?: string, onConnected?: () => void) => {
    if (socket.value?.connected) return

    if (socket.value) {
      socket.value.disconnect()
      socket.value = null
    }

    const url = (config.public.socketUrl as string) || 'http://localhost:4000'

    socket.value = io(url, {
      auth: { token },
      transports: ['websocket', 'polling']
    })

    socket.value.on('connect', () => {
      isConnected.value = true
      console.log('[Socket] Connected')
      onConnected?.()
    })

    socket.value.on('disconnect', (reason) => {
      isConnected.value = false
      console.log('[Socket] Disconnected:', reason)
    })

    socket.value.on('connect_error', (err) => {
      console.error('[Socket] Connection error:', err.message)
    })
  }

  const disconnect = () => {
    if (socket.value) {
      socket.value.removeAllListeners()
      socket.value.disconnect()
      socket.value = null
      isConnected.value = false
    }
  }

  return { socket, isConnected, connect, disconnect }
}
