<template>
  <div class="flex flex-col h-[100dvh] max-w-3xl mx-auto bg-gray-50 shadow-xl overflow-hidden relative">
    <ChatProfileHeader />

    <main ref="scrollContainer" class="flex-1 overflow-y-auto p-4 sm:p-6 scroll-smooth">
      <div class="space-y-2">
        <MessageBubble
          v-for="msg in messages"
          :key="msg.id"
          :message="msg"
          @approve="approvePayment"
          @addToCart="handleAddToCart"
          @quickReply="sendMessage"
        />
        <div v-if="isTyping" class="flex items-center gap-1.5 ml-4 mt-4">
          <span class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></span>
          <span class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 0.1s"></span>
          <span class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 0.2s"></span>
        </div>
      </div>
    </main>

    <InputBar @send="sendMessage" :disabled="!isConnected" class="shrink-0" />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onMounted } from 'vue'
import { useChat } from '../../composables/useChat'
import { useSocket } from '../../composables/useSocket'
import type { ProductItem } from '../../composables/useChat'
import MessageBubble from './MessageBubble.vue'
import InputBar from './InputBar.vue'
import ChatProfileHeader from './ChatProfileHeader.vue'

const { messages, isTyping, sendMessage, approvePayment, setupListeners } = useChat()
const { isConnected } = useSocket()
const scrollContainer = ref<HTMLElement | null>(null)

function handleAddToCart(product: ProductItem) {
  sendMessage(`Add "${product.name}" to my cart. productId: ${product.id}`)
}

watch(() => messages.value.length, async () => {
  await nextTick()
  if (scrollContainer.value) {
    scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight
  }
})

onMounted(() => {
  setupListeners()
})
</script>
