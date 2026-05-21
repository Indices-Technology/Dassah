<template>
  <div
    class="markdown-text text-[15px] leading-relaxed space-y-1.5"
    v-html="rendered"
    @click="onClickDelegate"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  content: string
  interactive?: boolean  // true for bot messages — list items become chips
}>()

const emit = defineEmits<{ action: [text: string] }>()

const rendered = computed(() => {
  let html = props.content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Bold / Italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')

  if (props.interactive) {
    // Bullet list items → clickable chip spans
    html = html.replace(
      /^[-*•] (.+)/gm,
      (_, text) =>
        `<span data-chip="${text.replace(/"/g, '&quot;')}" class="chat-chip">${text}</span>`,
    )
  } else {
    html = html.replace(/^[-*•] (.+)/gm, '<li class="ml-4 list-disc">$1</li>')
  }

  // Numbered list items (non-interactive)
  html = html.replace(/^\d+\. (.+)/gm, '<li class="ml-4 list-decimal">$1</li>')

  // Wrap chip spans in a flex container
  if (props.interactive) {
    html = html.replace(
      /(<span data-chip[^>]*>.*?<\/span>(?:\n<span data-chip[^>]*>.*?<\/span>)*)/gs,
      '<div class="chip-group">$1</div>',
    )
  }

  // Paragraphs
  const paragraphs = html.split(/\n{2,}/)
  html = paragraphs
    .map((p) => {
      if (p.includes('<li')) return `<ul>${p}</ul>`
      if (p.includes('chip-group')) return p
      return `<p>${p.replace(/\n/g, '<br>')}</p>`
    })
    .join('')

  return html
})

function onClickDelegate(e: MouseEvent) {
  const chip = (e.target as HTMLElement).closest('[data-chip]') as HTMLElement | null
  if (chip) emit('action', chip.dataset.chip!)
}
</script>

<style scoped>
.markdown-text :deep(ul)        { @apply space-y-1 my-1; }
.markdown-text :deep(p)         { @apply my-0; }
.markdown-text :deep(.chip-group) {
  @apply flex flex-wrap gap-2 my-2;
}
.markdown-text :deep(.chat-chip) {
  @apply inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium
         bg-gray-100 text-gray-700 border border-gray-200
         cursor-pointer select-none transition-colors;
}
.markdown-text :deep(.chat-chip:hover) {
  @apply bg-blue-50 text-blue-700 border-blue-200;
}
.markdown-text :deep(.chat-chip:active) {
  @apply bg-blue-100;
}
</style>
