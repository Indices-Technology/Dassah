<template>
  <div class="mt-2 space-y-2">
    <div
      v-for="market in markets"
      :key="market.id"
      class="overflow-hidden rounded-xl border border-gray-200 bg-white"
    >
      <!-- Optional banner -->
      <div
        v-if="market.bannerUrl"
        class="h-16 w-full bg-gray-100 bg-cover bg-center"
        :style="{ backgroundImage: `url(${market.bannerUrl})` }"
      />

      <div class="flex items-center gap-3 p-3">
        <!-- Icon -->
        <img
          v-if="market.iconUrl"
          :src="market.iconUrl"
          :alt="market.name"
          class="h-12 w-12 flex-shrink-0 rounded-lg object-cover bg-gray-100"
          @error="onIconError"
        />
        <div
          v-else
          class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100 text-lg"
        >
          {{ market.type === 'GEOGRAPHIC' ? '🏪' : '🏷️' }}
        </div>

        <!-- Info -->
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5">
            <span class="truncate text-sm font-semibold text-gray-900">{{ market.name }}</span>
            <span
              class="flex-shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
              :class="market.type === 'GEOGRAPHIC' ? 'bg-emerald-50 text-emerald-600' : 'bg-indigo-50 text-indigo-600'"
            >
              {{ market.type === 'GEOGRAPHIC' ? 'Market' : 'Category' }}
            </span>
          </div>
          <p v-if="market.description" class="line-clamp-1 text-xs text-gray-500">
            {{ market.description }}
          </p>
          <p v-if="locationLabel(market)" class="truncate text-[11px] text-gray-400">
            📍 {{ locationLabel(market) }}
          </p>
          <p v-if="statsLabel(market)" class="truncate text-[11px] text-gray-400">
            {{ statsLabel(market) }}
          </p>
        </div>

        <!-- Actions -->
        <div class="flex flex-shrink-0 flex-col gap-1">
          <button
            class="rounded-full bg-[#e52033] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#c91b2c]"
            @click="browse(market)"
          >
            Browse
          </button>
          <a
            v-if="market.marketUrl"
            :href="market.marketUrl"
            target="_blank"
            rel="noopener"
            class="rounded-full border border-gray-200 px-3 py-1.5 text-center text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            Open
          </a>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { MarketItem } from '../../composables/useChat'

defineProps<{ markets: MarketItem[] }>()
const emit = defineEmits<{ select: [text: string] }>()

function browse(market: MarketItem) {
  emit('select', `Show me what's in "${market.name}" — marketSlug: ${market.slug}`)
}

// Prefer the pre-joined location (semantic_search), else build from city/state (view_market).
function locationLabel(market: MarketItem): string | null {
  if (market.location) return market.location
  return [market.city, market.state].filter(Boolean).join(', ') || null
}

// "12 sellers · 340 followers · 58 products" — only the parts we have.
function statsLabel(market: MarketItem): string | null {
  const parts: string[] = []
  if (market.members != null) parts.push(`${market.members} seller${market.members === 1 ? '' : 's'}`)
  if (market.followers != null) parts.push(`${market.followers} follower${market.followers === 1 ? '' : 's'}`)
  if (market.productCount != null) parts.push(`${market.productCount} product${market.productCount === 1 ? '' : 's'}`)
  return parts.length ? parts.join(' · ') : null
}

function onIconError(e: Event) {
  ;(e.target as HTMLImageElement).style.display = 'none'
}
</script>
