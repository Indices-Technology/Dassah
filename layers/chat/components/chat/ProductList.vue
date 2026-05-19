<template>
  <div class="mt-3">
    <p class="text-xs text-gray-400 mb-2 font-medium uppercase tracking-wide">
      {{ products.length }} result{{ products.length === 1 ? '' : 's' }}
    </p>
    <div class="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-hide">
      <ProductCard
        v-for="product in products"
        :key="product.id"
        :product="product"
        class="snap-start"
        @addToCart="$emit('addToCart', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ProductItem } from '../../composables/useChat'
import ProductCard from './ProductCard.vue'

defineProps<{ products: ProductItem[] }>()
defineEmits<{ addToCart: [product: ProductItem] }>()
</script>

<style scoped>
.scrollbar-hide {
  scrollbar-width: none;
}
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
</style>
