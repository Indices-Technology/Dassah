<template>
  <div class="mt-2 space-y-2">
    <div
      v-for="o in orders"
      :key="o.id"
      class="rounded-xl border border-gray-200 bg-white p-3"
    >
      <div class="flex items-center justify-between">
        <span class="text-sm font-semibold text-gray-900">Order #{{ o.id }}</span>
        <span class="rounded-full px-2 py-0.5 text-[11px] font-medium" :class="badge(o.status)">{{ o.status }}</span>
      </div>

      <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500">
        <span class="font-medium text-gray-700">{{ money(o.total) }}</span>
        <span v-if="o.itemCount">· {{ o.itemCount }} item{{ o.itemCount === 1 ? '' : 's' }}</span>
        <span v-if="o.paymentStatus">· {{ o.paymentStatus }}</span>
        <span v-if="o.createdAt">· {{ date(o.createdAt) }}</span>
      </div>

      <div class="mt-2 flex flex-wrap gap-1.5">
        <button
          v-for="a in actionsFor(o.status)"
          :key="a.label"
          class="rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
          @click="$emit('select', a.prompt(o.id))"
        >{{ a.label }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { SellerOrder } from '../../composables/useChat'

defineProps<{ orders: SellerOrder[] }>()
defineEmits<{ select: [text: string] }>()

function money(n?: number) {
  return n === undefined || n === null ? '—' : `₦${Number(n).toLocaleString('en-NG')}`
}
function date(d?: string) {
  if (!d) return ''
  const t = new Date(d)
  return isNaN(t.getTime()) ? '' : t.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })
}
function badge(status: string) {
  const s = (status || '').toUpperCase()
  if (s === 'PENDING') return 'bg-amber-100 text-amber-700'
  if (s === 'CONFIRMED') return 'bg-blue-100 text-blue-700'
  if (s === 'SHIPPED') return 'bg-indigo-100 text-indigo-700'
  if (s === 'DELIVERED') return 'bg-green-100 text-green-700'
  if (s === 'CANCELLED') return 'bg-red-100 text-red-600'
  return 'bg-gray-100 text-gray-600'
}
function actionsFor(status: string) {
  const s = (status || '').toUpperCase()
  const view = { label: 'View', prompt: (id: string | number) => `Show me order #${id}` }
  if (s === 'PENDING') return [view, { label: 'Confirm', prompt: (id: string | number) => `Confirm order #${id}` }, { label: 'Cancel', prompt: (id: string | number) => `Cancel order #${id}` }]
  if (s === 'CONFIRMED') return [view, { label: 'Mark shipped', prompt: (id: string | number) => `Ship order #${id}` }]
  return [view]
}
</script>
