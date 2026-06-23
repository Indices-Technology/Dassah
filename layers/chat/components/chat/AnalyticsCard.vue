<template>
  <div class="mt-2 rounded-xl border border-gray-100 bg-gray-50/60 p-3">
    <!-- Header -->
    <div class="mb-2 flex items-center justify-between">
      <span class="text-xs font-semibold text-gray-700">Store performance</span>
      <span class="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-600">
        {{ timeframeLabel }}
      </span>
    </div>

    <!-- KPI grid -->
    <div class="grid grid-cols-3 gap-2">
      <div class="rounded-lg bg-white p-2 text-center">
        <div class="text-sm font-bold text-[#e52033]">{{ naira(s.revenue) }}</div>
        <div class="text-[10px] text-gray-500">Revenue</div>
      </div>
      <div class="rounded-lg bg-white p-2 text-center">
        <div class="text-sm font-bold text-gray-800">{{ s.orders }}</div>
        <div class="text-[10px] text-gray-500">Orders</div>
      </div>
      <div class="rounded-lg bg-white p-2 text-center">
        <div class="text-sm font-bold text-gray-800">{{ s.unitsSold }}</div>
        <div class="text-[10px] text-gray-500">Units</div>
      </div>
      <div class="rounded-lg bg-white p-2 text-center">
        <div class="text-sm font-bold text-gray-800">{{ fmt(s.views) }}</div>
        <div class="text-[10px] text-gray-500">Views</div>
      </div>
      <div class="rounded-lg bg-white p-2 text-center">
        <div class="text-sm font-bold text-gray-800">{{ fmt(s.impressions) }}</div>
        <div class="text-[10px] text-gray-500">Impressions</div>
      </div>
      <div class="rounded-lg bg-white p-2 text-center">
        <div class="text-sm font-bold text-gray-800">{{ s.conversionRate }}%</div>
        <div class="text-[10px] text-gray-500">Conversion</div>
      </div>
    </div>

    <!-- Daily revenue bars -->
    <div v-if="chart.length" class="mt-3">
      <div class="mb-1 text-[10px] font-medium text-gray-500">Daily revenue</div>
      <div class="flex h-16 items-end gap-0.5">
        <div
          v-for="(d, i) in chart"
          :key="i"
          class="flex-1 rounded-t bg-[#e52033]/80"
          :style="{ height: barHeight(d.revenue) }"
          :title="`${d.date}: ${naira(d.revenue)}`"
        />
      </div>
    </div>

    <!-- Top products -->
    <div v-if="top.length" class="mt-3">
      <div class="mb-1 text-[10px] font-medium text-gray-500">Top products</div>
      <div class="space-y-1">
        <div v-for="p in top" :key="p.productId" class="flex items-center justify-between text-xs">
          <span class="truncate text-gray-700">{{ p.title }}</span>
          <span class="ml-2 shrink-0 text-gray-500">{{ p.unitsSold }} sold · {{ naira(p.revenue) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Summary {
  revenue: number; orders: number; unitsSold: number
  views: number; impressions: number; conversionRate: number
}
interface ChartPoint { date: string; revenue: number }
interface TopProduct { productId: number; title: string; revenue: number; unitsSold: number }

const props = defineProps<{
  analytics: {
    timeframe?: string
    summary?: Partial<Summary>
    chart?: ChartPoint[]
    topProducts?: TopProduct[]
  }
}>()

const s = computed<Summary>(() => ({
  revenue: 0, orders: 0, unitsSold: 0, views: 0, impressions: 0, conversionRate: 0,
  ...(props.analytics.summary ?? {}),
}))
const chart = computed(() => props.analytics.chart ?? [])
const top = computed(() => (props.analytics.topProducts ?? []).slice(0, 3))

const timeframeLabel = computed(() => ({ today: 'Today', week: 'This week', month: 'This month', all: 'All time' }[props.analytics.timeframe ?? 'week'] ?? props.analytics.timeframe))

const maxRevenue = computed(() => Math.max(1, ...chart.value.map((d) => d.revenue || 0)))
function barHeight(v: number): string {
  return `${Math.max(4, Math.round(((v || 0) / maxRevenue.value) * 100))}%`
}

function fmt(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n ?? 0)
}
function naira(n: number): string {
  return `₦${Number(n ?? 0).toLocaleString('en-NG')}`
}
</script>
