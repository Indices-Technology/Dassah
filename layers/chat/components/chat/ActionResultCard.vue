<template>
  <!-- Authoritative outcome: rendered from read-after-write verification, NOT from
       the agent's text. If the write didn't land, this card says so regardless of
       what the message claims. -->
  <div
    class="mt-2 rounded-xl border p-3"
    :class="ok ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'"
  >
    <div class="flex items-center gap-2">
      <span
        class="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
        :class="ok ? 'bg-green-500' : 'bg-red-500'"
      >{{ ok ? '✓' : '✗' }}</span>
      <span class="text-sm font-semibold" :class="ok ? 'text-green-800' : 'text-red-800'">
        {{ ok ? 'Confirmed' : 'Not done' }}
      </span>
      <span v-if="result.target?.label" class="truncate text-xs text-gray-500">
        · {{ result.target.label }}
      </span>
    </div>

    <!-- Verified before → after -->
    <div v-if="ok && result.change" class="mt-2 flex items-center gap-2 text-sm text-gray-700">
      <span class="text-gray-500">{{ result.change.field }}</span>
      <span class="font-mono text-gray-400">{{ fmt(result.change.before) }}</span>
      <span class="text-gray-400">→</span>
      <span class="font-mono font-semibold text-gray-900">{{ fmt(result.change.actual) }}</span>
    </div>

    <!-- Real failure reason (never fabricated) -->
    <p v-else-if="!ok" class="mt-1.5 text-xs text-red-700">
      {{ result.error || 'The change could not be verified.' }}
    </p>

    <p class="mt-1.5 text-[10px] uppercase tracking-wide" :class="ok ? 'text-green-600' : 'text-red-500'">
      {{ result.verified ? 'verified against your store' : 'unverified — re-check before relying on it' }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ActionResult } from '../../composables/useChat'

const props = defineProps<{ result: ActionResult }>()

const ok = computed(() => props.result.success && props.result.verified)

function fmt(v: number | string | null | undefined) {
  return v === null || v === undefined || v === '' ? '—' : String(v)
}
</script>
