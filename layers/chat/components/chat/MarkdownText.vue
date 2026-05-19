<template>
  <div class="markdown-text text-[15px] leading-relaxed space-y-1.5" v-html="rendered" />
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ content: string }>()

const rendered = computed(() => {
  let html = props.content
    // Escape raw HTML
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Bold **text**
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  // Italic *text*
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')

  // Unordered list items: lines starting with - or *
  html = html.replace(/^[-*] (.+)/gm, '<li class="ml-4 list-disc">$1</li>')
  // Numbered list items
  html = html.replace(/^\d+\. (.+)/gm, '<li class="ml-4 list-decimal">$1</li>')
  // Wrap consecutive li items in ul/ol
  html = html.replace(/(<li[^>]*>[\s\S]*?<\/li>)(\n<li)/g, '$1$2')

  // Line breaks: double newline → paragraph break; single → <br>
  const paragraphs = html.split(/\n{2,}/)
  html = paragraphs
    .map((p) => {
      if (p.includes('<li')) return `<ul>${p}</ul>`
      return `<p>${p.replace(/\n/g, '<br>')}</p>`
    })
    .join('')

  return html
})
</script>

<style scoped>
.markdown-text :deep(ul) {
  @apply space-y-1 my-1;
}
.markdown-text :deep(p) {
  @apply my-0;
}
</style>
