<template>
  <div class="flex-shrink-0 w-44 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden cursor-pointer hover:shadow-md transition-shadow">
    <div class="w-full h-32 bg-gray-100 overflow-hidden">
      <img
        v-if="product.imageUrl"
        :src="product.imageUrl"
        :alt="product.name"
        class="w-full h-full object-cover"
      />
      <div v-else class="w-full h-full flex items-center justify-center text-gray-300 text-3xl">
        🛍️
      </div>
    </div>

    <div class="p-2.5 space-y-1">
      <p class="text-xs font-semibold text-gray-800 line-clamp-2 leading-tight">{{ product.name }}</p>
      <p class="text-xs text-gray-400 truncate">{{ product.seller }}</p>
      <p class="text-sm font-bold text-blue-600">₦{{ formatPrice(product.price) }}</p>

      <button
        :disabled="!product.inStock"
        @click.stop="$emit('addToCart', product)"
        class="w-full mt-1 py-1.5 rounded-lg text-xs font-medium transition-colors"
        :class="product.inStock
          ? 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800'
          : 'bg-gray-100 text-gray-400 cursor-not-allowed'"
      >
        {{ product.inStock ? 'Add to Cart' : 'Out of Stock' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ProductItem } from '../../composables/useChat'

defineProps<{ product: ProductItem }>()
defineEmits<{ addToCart: [product: ProductItem] }>()

function formatPrice(price: number): string {
  return price.toLocaleString('en-NG')
}
</script>
