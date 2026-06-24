<template>
  <div class="mt-2 space-y-2">
    <!-- Balance summary -->
    <div v-if="hasBalance" class="rounded-xl border border-gray-200 bg-white p-3">
      <div class="text-xs text-gray-500">Available to withdraw</div>
      <div class="text-2xl font-bold text-gray-900">{{ money(wallet.available) }}</div>
      <div class="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
        <span v-if="wallet.pending != null">Pending: <span class="font-medium text-gray-700">{{ money(wallet.pending) }}</span></span>
        <span v-if="wallet.totalEarned != null">Earned: <span class="font-medium text-gray-700">{{ money(wallet.totalEarned) }}</span></span>
      </div>
      <button
        v-if="(wallet.available || 0) > 0"
        class="mt-2 rounded-full bg-[#e52033] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#c91b2c]"
        @click="$emit('select', 'I want to withdraw funds')"
      >Withdraw</button>
    </div>

    <!-- Saved bank accounts -->
    <div v-if="wallet.accounts?.length" class="rounded-xl border border-gray-200 bg-white p-3">
      <div class="mb-1.5 text-xs font-semibold text-gray-500">Bank accounts</div>
      <div v-for="a in wallet.accounts" :key="a.id" class="flex items-center justify-between py-1 text-sm">
        <div class="min-w-0">
          <div class="truncate text-gray-800">{{ a.accountName || '—' }}</div>
          <div class="text-xs text-gray-400">{{ a.bankName }} · {{ a.accountNumber }}</div>
        </div>
        <span v-if="a.isDefault" class="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">default</span>
      </div>
    </div>

    <!-- Transactions -->
    <div v-if="wallet.transactions?.length" class="rounded-xl border border-gray-200 bg-white p-3">
      <div class="mb-1.5 text-xs font-semibold text-gray-500">Recent transactions</div>
      <div v-for="t in wallet.transactions.slice(0, 8)" :key="t.id" class="flex items-center justify-between py-1 text-sm">
        <div class="min-w-0">
          <div class="truncate text-gray-700">{{ t.reason || t.type }}</div>
          <div class="text-xs text-gray-400">{{ date(t.createdAt) }} · {{ t.status }}</div>
        </div>
        <span class="font-medium" :class="isCredit(t.type) ? 'text-green-600' : 'text-gray-800'">
          {{ isCredit(t.type) ? '+' : '−' }}{{ money(t.amount) }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { WalletInfo } from '../../composables/useChat'

const props = defineProps<{ wallet: WalletInfo }>()
defineEmits<{ select: [text: string] }>()

const hasBalance = computed(() =>
  props.wallet.available != null || props.wallet.pending != null || props.wallet.totalEarned != null,
)

function money(n?: number | null) {
  return n === undefined || n === null ? '—' : `₦${Number(n).toLocaleString('en-NG')}`
}
function date(d?: string) {
  if (!d) return ''
  const t = new Date(d)
  return isNaN(t.getTime()) ? '' : t.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })
}
function isCredit(type?: string) {
  return /credit|earn|sale|deposit|refund/i.test(type || '')
}
</script>
