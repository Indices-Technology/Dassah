<template>
  <div class="mt-2 space-y-2">
    <div
      v-for="store in stores"
      :key="store.id"
      class="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3"
    >
      <!-- Logo -->
      <img
        v-if="store.logo"
        :src="store.logo"
        :alt="store.name"
        class="h-12 w-12 flex-shrink-0 rounded-lg object-cover bg-gray-100"
        @error="onLogoError"
      />
      <div
        v-else
        class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100 text-lg font-semibold text-gray-500"
      >
        {{ store.name?.charAt(0) || 'S' }}
      </div>

      <!-- Info -->
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-1">
          <span class="truncate text-sm font-semibold text-gray-900">{{ store.name }}</span>
          <span v-if="store.verified" class="text-blue-500" title="Verified">✓</span>
        </div>
        <p v-if="store.description" class="line-clamp-1 text-xs text-gray-500">
          {{ store.description }}
        </p>
        <p v-if="store.location" class="truncate text-[11px] text-gray-400">📍 {{ store.location }}</p>
      </div>

      <!-- Actions -->
      <div class="flex flex-shrink-0 flex-col gap-1">
        <button
          class="rounded-full bg-[#e52033] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#c91b2c]"
          @click="$emit('select', `Browse products from \"${store.name}\" — storeSlug: ${store.slug}`)"
        >
          View products
        </button>
        <a
          v-if="store.profileUrl"
          :href="store.profileUrl"
          target="_blank"
          rel="noopener"
          class="rounded-full border border-gray-200 px-3 py-1.5 text-center text-xs font-medium text-gray-600 hover:bg-gray-50"
        >
          Profile
        </a>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { StoreItem } from '../../composables/useChat'

defineProps<{ stores: StoreItem[] }>()
defineEmits<{ select: [text: string] }>()

function onLogoError(e: Event) {
  ;(e.target as HTMLImageElement).style.display = 'none'
}
</script>
