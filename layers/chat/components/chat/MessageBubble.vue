<template>
  <div :class="['flex w-full mb-4', alignmentClass]">
    <div :class="['rounded-2xl p-3 shadow-sm', bubbleClass, widthClass]">
      <!-- Message text -->
      <MarkdownText
        v-if="message.role !== 'system'"
        :content="message.content"
        :class="message.role === 'user' ? 'text-white' : 'text-gray-800'"
      />
      <div v-else class="text-xs text-gray-600 text-center">{{ message.content }}</div>

      <!-- Payment prompt -->
      <PaymentPrompt
        v-if="message.metadata?.approvalToken"
        :metadata="message.metadata"
        @approve="$emit('approve', message.metadata.approvalToken)"
      />

      <!-- Product cards -->
      <ProductList
        v-if="message.metadata?.products?.length"
        :products="message.metadata.products"
        @addToCart="$emit('addToCart', $event)"
      />

      <!-- Cart update confirmation -->
      <div
        v-if="message.metadata?.cartUpdate"
        class="mt-2 flex items-center gap-1.5 text-xs"
        :class="message.metadata.cartUpdate.success ? 'text-green-600' : 'text-red-500'"
      >
        <span>{{ message.metadata.cartUpdate.success ? '✓' : '✗' }}</span>
        <span>{{ message.metadata.cartUpdate.message }}</span>
      </div>

      <!-- Quick replies -->
      <QuickReplies
        v-if="message.metadata?.quickReplies?.length && message.role === 'bot'"
        :replies="message.metadata.quickReplies"
        @select="$emit('quickReply', $event)"
      />

      <div :class="['text-[10px] mt-1.5 text-right opacity-70', message.role === 'user' ? 'text-blue-100' : 'text-gray-400']">
        {{ new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ChatMessage, ProductItem } from '../../composables/useChat'
import PaymentPrompt from './PaymentPrompt.vue'
import MarkdownText from './MarkdownText.vue'
import ProductList from './ProductList.vue'
import QuickReplies from './QuickReplies.vue'

const props = defineProps<{ message: ChatMessage }>()
defineEmits<{
  approve: [token: string]
  addToCart: [product: ProductItem]
  quickReply: [text: string]
}>()

const alignmentClass = computed(() => {
  if (props.message.role === 'user') return 'justify-end'
  if (props.message.role === 'system') return 'justify-center'
  return 'justify-start'
})

// Bot messages with products need more width to show the cards
const widthClass = computed(() => {
  if (props.message.role === 'system') return 'max-w-full'
  if (props.message.role === 'bot' && props.message.metadata?.products?.length) return 'w-full max-w-[95%]'
  return 'max-w-[85%] sm:max-w-[75%]'
})

const bubbleClass = computed(() => {
  if (props.message.role === 'user') return 'bg-blue-600 text-white rounded-br-sm'
  if (props.message.role === 'system') return 'bg-gray-200 text-gray-600 text-xs text-center mx-auto'
  return 'bg-white text-gray-800 border border-gray-100 rounded-bl-sm'
})
</script>
