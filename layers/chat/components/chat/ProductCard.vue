<template>
  <div class="flex-shrink-0 w-48 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all">

    <!-- Image -->
    <div class="relative w-full h-36 bg-gray-50 overflow-hidden">
      <img
        v-if="product.imageUrl && !imgError"
        :src="product.imageUrl"
        :alt="product.name"
        class="w-full h-full object-cover"
        @error="imgError = true"
      />
      <div v-else class="w-full h-full flex flex-col items-center justify-center gap-1 text-gray-300">
        <span class="text-3xl">🛍️</span>
        <span class="text-[10px]">No image</span>
      </div>

      <!-- Out of stock badge -->
      <div
        v-if="!product.inStock"
        class="absolute inset-0 bg-black/40 flex items-center justify-center"
      >
        <span class="text-white text-xs font-bold bg-black/60 px-2 py-1 rounded-full">Out of stock</span>
      </div>

      <!-- Discount badge -->
      <div
        v-if="product.discount"
        class="absolute top-2 left-2 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full"
      >
        -{{ product.discount }}%
      </div>
    </div>

    <!-- Info -->
    <div class="p-3 space-y-1.5">
      <p class="text-xs font-semibold text-gray-800 line-clamp-2 leading-tight">{{ product.name }}</p>

      <!-- Seller -->
      <p v-if="product.seller" class="text-[10px] text-gray-400 truncate flex items-center gap-1">
        <svg class="w-2.5 h-2.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
        {{ product.seller }}
      </p>

      <!-- Price row -->
      <div class="flex items-baseline gap-1.5">
        <span class="text-sm font-bold text-gray-900">₦{{ formatPrice(product.price) }}</span>
        <span v-if="product.originalPrice && product.originalPrice > product.price" class="text-[10px] text-gray-400 line-through">
          ₦{{ formatPrice(product.originalPrice) }}
        </span>
      </div>

      <!-- Add to cart -->
      <button
        :disabled="!product.inStock"
        @click.stop="$emit('addToCart', product)"
        class="w-full py-1.5 rounded-xl text-xs font-semibold transition-all"
        :class="product.inStock
          ? 'bg-blue-600 text-white hover:bg-blue-700 active:scale-95'
          : 'bg-gray-100 text-gray-400 cursor-not-allowed'"
      >
        {{ product.inStock ? '+ Add to Cart' : 'Out of Stock' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { ProductItem } from '../../composables/useChat'

defineProps<{ product: ProductItem & { discount?: number; originalPrice?: number } }>()
defineEmits<{ addToCart: [product: ProductItem] }>()

const imgError = ref(false)

function formatPrice(price: number): string {
  return price.toLocaleString('en-NG')
}
</script>
