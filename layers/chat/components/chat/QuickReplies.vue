<template>
  <div class="flex flex-wrap gap-2 mt-3">
    <button
      v-for="reply in replies"
      :key="reply"
      @click="$emit('select', reply)"
      class="px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-xs font-medium hover:bg-blue-100 active:bg-blue-200 transition-colors whitespace-nowrap"
    >
      {{ reply }}
    </button>
  </div>
</template>

<script setup lang="ts">
defineProps<{ replies: string[] }>()
defineEmits<{ select: [reply: string] }>()
</script>
