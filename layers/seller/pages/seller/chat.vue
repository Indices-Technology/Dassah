<template>
  <div class="flex flex-col h-[100dvh] max-w-3xl mx-auto bg-slate-900 shadow-xl overflow-hidden relative">
    <header class="bg-slate-800 border-b border-slate-700 px-6 py-4 flex items-center justify-between shrink-0">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 bg-purple-600 text-white rounded-full flex items-center justify-center font-bold shadow">
          DA
        </div>
        <div>
          <h1 class="font-bold text-lg leading-tight text-white">DassaAI Seller</h1>
          <p class="text-xs text-slate-400">Store Manager</p>
        </div>
      </div>
      <div class="flex items-center gap-3">
        <span :class="['text-xs px-2.5 py-1 rounded-full font-medium', isConnected ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300']">
          {{ isConnected ? 'Online' : 'Disconnected' }}
        </span>
        <button @click="switchToBuyer" class="text-xs px-3 py-1 rounded-full bg-blue-600 text-white hover:bg-blue-700 transition">
          Switch to Buyer
        </button>
      </div>
    </header>

    <main ref="scrollContainer" class="flex-1 overflow-y-auto p-4 sm:p-6 scroll-smooth bg-slate-900">
      <div class="space-y-2">
        <div
          v-for="(msg, index) in messages"
          :key="index"
          :class="[
            'message-bubble',
            msg.role === 'user' ? 'user' : msg.role === 'system' ? 'system' : 'assistant'
          ]"
        >
          <div class="bubble-content">
            {{ msg.content }}
          </div>
        </div>
        <div v-if="isTyping" class="text-slate-500 text-sm italic ml-4 flex items-center gap-1.5 mt-4">
          <span class="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce"></span>
          <span class="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style="animation-delay: 0.1s"></span>
          <span class="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style="animation-delay: 0.2s"></span>
        </div>
      </div>
    </main>

    <div class="shrink-0 bg-slate-800 p-4">
      <div class="flex gap-2 max-w-3xl mx-auto">
        <input
          v-model="inputText"
          @keyup.enter="handleSend"
          :disabled="!isConnected"
          placeholder="Ask about your store, analytics, or run campaigns..."
          class="flex-1 px-4 py-3 rounded-lg bg-slate-700 text-white placeholder-slate-400 border border-slate-600 focus:border-purple-500 focus:outline-none"
        />
        <button
          @click="handleSend"
          :disabled="!isConnected || !inputText.trim()"
          class="px-6 py-3 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          Send
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
// useAuth auto-imported from core layer
// useSocket / useChat auto-imported from chat layer

definePageMeta({
  middleware: ['auth']
})

const { token } = useAuth()
const { isConnected, connect, disconnect } = useSocket()
const { messages, isTyping, sendMessage, clearMessages, setupListeners } = useChat()

const inputText = ref('')
const scrollContainer = ref<HTMLElement | null>(null)

function handleSend() {
  if (!inputText.value.trim() || !isConnected.value) return
  sendMessage(inputText.value.trim())
  inputText.value = ''
}

function switchToBuyer() {
  navigateTo('/chat')
}

watch(() => messages.value.length, async () => {
  await nextTick()
  scrollContainer.value?.scrollTo(0, scrollContainer.value.scrollHeight)
})

onMounted(() => {
  clearMessages()
  messages.value.push({
    id: 'welcome',
    role: 'bot',
    content: 'Welcome to your Seller Dashboard! I can help you with:\n\n\u2022 Sales analytics and performance reports\n\u2022 Managing inventory and pricing\n\u2022 Running social media campaigns\n\u2022 Handling orders and shipments\n\nWhat would you like to do today?',
    createdAt: new Date()
  })

  if (token.value) {
    connect(token.value, () => {
      const { socket } = useSocket()
      socket.value?.emit('session:type', 'seller')
    })
  }
  setupListeners()
})

onUnmounted(() => {
  disconnect()
})
</script>

<style scoped>
.message-bubble { display: flex; margin-bottom: 0.75rem; }
.message-bubble.user { justify-content: flex-end; }
.message-bubble.system { justify-content: center; }
.message-bubble.assistant { justify-content: flex-start; }
.bubble-content {
  max-width: 80%;
  padding: 0.75rem 1rem;
  border-radius: 1rem;
  background: #1e293b;
  color: #e2e8f0;
  white-space: pre-wrap;
  line-height: 1.5;
}
.user .bubble-content { background: #7c3aed; }
.system .bubble-content {
  background: transparent;
  color: #94a3b8;
  font-size: 0.875rem;
  text-align: center;
  max-width: 90%;
}
.assistant .bubble-content { background: #1e293b; color: #e2e8f0; }
</style>
