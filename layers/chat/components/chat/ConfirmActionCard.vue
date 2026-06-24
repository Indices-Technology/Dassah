<template>
  <!-- Grounded confirmation: the "before" is freshly read from the API, not the
       agent's memory — so the seller approves the real change. Nothing applied yet. -->
  <div class="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
    <div class="flex items-center gap-2">
      <span class="text-amber-600">⚠️</span>
      <span class="text-sm font-semibold text-amber-800">Confirm this change</span>
      <span v-if="preview.target?.label" class="truncate text-xs text-amber-700/70">· {{ preview.target.label }}</span>
    </div>

    <div v-if="preview.change" class="mt-2 flex flex-wrap items-center gap-2 text-sm">
      <span class="text-gray-500">{{ preview.change.field }}</span>
      <span class="rounded bg-white px-2 py-0.5 font-mono text-gray-400 line-through">{{ fmt(preview.change.before) }}</span>
      <span class="text-gray-400">→</span>
      <span class="rounded bg-white px-2 py-0.5 font-mono font-semibold text-gray-900">{{ fmt(preview.change.after) }}</span>
    </div>

    <div class="mt-3 flex gap-2">
      <button
        class="rounded-full bg-[#e52033] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#c91b2c]"
        @click="$emit('select', 'Yes, go ahead')"
      >Confirm</button>
      <button
        class="rounded-full border border-gray-300 px-4 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
        @click="$emit('select', 'No, cancel')"
      >Cancel</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ActionPreview } from '../../composables/useChat'

defineProps<{ preview: ActionPreview }>()
defineEmits<{ select: [text: string] }>()

function fmt(v: number | string | null | undefined) {
  return v === null || v === undefined || v === '' ? '—' : String(v)
}
</script>
