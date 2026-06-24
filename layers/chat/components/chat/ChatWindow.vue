<template>
  <div class="flex h-full max-w-screen-md sm:max-w-screen-lg mx-auto bg-white shadow-xl overflow-hidden relative">

    <!-- Conversation sidebar -->
    <ConversationSidebar
      :open="sidebarOpen"
      :active-session-id="sessionId"
      @close="sidebarOpen = false"
      @new="startNewConversation"
      @select="loadConversation"
    />

    <!-- Main chat column -->
    <div class="flex flex-col flex-1 min-w-0">

      <!-- Header -->
      <ChatProfileHeader @toggle-sidebar="sidebarOpen = !sidebarOpen" />

      <!-- Messages -->
      <main ref="scrollContainer" class="flex-1 overflow-y-auto p-4 sm:p-6 scroll-smooth">
        <!-- Empty / welcome state -->
        <div v-if="messages.length === 0" class="flex flex-col items-center justify-center h-full gap-4 py-12 text-center px-6">
          <div class="w-14 h-14 rounded-2xl bg-[#e52033] flex items-center justify-center shadow-lg shadow-red-900/20">
            <span class="text-white text-xl font-black">DA</span>
          </div>
          <div>
            <h2 class="text-lg font-bold text-gray-900 mb-1">How can I help you?</h2>
            <p class="text-sm text-gray-400 max-w-xs leading-relaxed">
              Search for products, track your orders, manage your cart, or ask anything about MarketX.
            </p>
          </div>
          <div class="flex flex-wrap gap-2 justify-center mt-2">
            <button
              v-for="suggestion in suggestions"
              :key="suggestion"
              @click="sendMessage(suggestion)"
              class="px-3.5 py-2 rounded-full bg-gray-100 text-gray-600 text-xs font-semibold hover:bg-[#e52033]/8 hover:text-[#e52033] hover:border-[#e52033]/20 border border-transparent transition-all"
            >
              {{ suggestion }}
            </button>
          </div>
        </div>

        <!-- Messages list -->
        <div v-else class="space-y-2">
          <MessageBubble
            v-for="msg in messages"
            :key="msg.id"
            :message="msg"
            @approve="approvePayment"
            @addToCart="handleAddToCart"
            @quickReply="sendMessage"
          />
          <div v-if="isTyping" class="flex items-center gap-1 ml-12 mt-2 mb-2">
            <div class="flex items-center gap-1 rounded-2xl rounded-bl-sm border border-gray-100 bg-white px-3.5 py-2.5 shadow-sm">
              <span class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style="animation-delay:0s" />
              <span class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style="animation-delay:0.15s" />
              <span class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style="animation-delay:0.3s" />
            </div>
          </div>
        </div>
      </main>

      <InputBar @send="sendMessage" :disabled="!isConnected" class="shrink-0" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onMounted } from 'vue'
import { useChat } from '../../composables/useChat'
import { useSocket } from '../../composables/useSocket'
import { useConversations } from '../../composables/useConversations'
import type { ProductItem } from '../../composables/useChat'
import MessageBubble from './MessageBubble.vue'
import InputBar from './InputBar.vue'
import ChatProfileHeader from './ChatProfileHeader.vue'
import ConversationSidebar from './ConversationSidebar.vue'

const { messages, isTyping, sessionId, sendMessage, approvePayment, clearMessages, setupListeners } = useChat()
const { isConnected, socket } = useSocket()
const { upsert } = useConversations()

const scrollContainer = ref<HTMLElement | null>(null)
const sidebarOpen = ref(false)

const suggestions = [
  'Find me Nike sneakers under ₦30,000',
  'Show my recent orders',
  'What\'s in my cart?',
  'Track my last delivery',
]

function handleAddToCart(product: ProductItem) {
  sendMessage(`Add "${product.name}" to my cart. productId: ${product.id}`)
}

function startNewConversation() {
  clearMessages()
  sidebarOpen.value = false
  socket.value?.emit('chat:new')
}

function loadConversation(sessionId: string) {
  clearMessages()
  sidebarOpen.value = false
  socket.value?.emit('chat:load', { sessionId })
}

// Track the first user message to build conversation title
let conversationTitled = false
watch(messages, (msgs) => {
  if (conversationTitled || !sessionId.value) return
  const firstUser = msgs.find(m => m.role === 'user')
  if (firstUser) {
    upsert(sessionId.value, firstUser.content)
    conversationTitled = true
  }
}, { deep: true })

// Reset titled flag when session changes
watch(sessionId, () => { conversationTitled = false })

watch(() => messages.value.length, async () => {
  await nextTick()
  if (scrollContainer.value) {
    scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight
  }
})

onMounted(() => {
  setupListeners()
  // The socket connects once at the app level and emits `chat:history` only on
  // that initial connect. If it's already connected when this view mounts (e.g.
  // navigating back from seller mode), that event won't re-fire — request the
  // history explicitly so the conversation isn't blank until a full refresh.
  if (socket.value?.connected) {
    socket.value.emit('chat:load', { sessionId: sessionId.value ?? '' })
  }
})

// If the socket was still connecting at mount ("Connecting…"), pull history the
// moment it comes online.
watch(isConnected, (connected) => {
  if (connected) socket.value?.emit('chat:load', { sessionId: sessionId.value ?? '' })
})
</script>
