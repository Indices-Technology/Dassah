<template>
  <div class="bg-slate-900 min-h-screen flex items-center justify-center">
    <p class="text-slate-400">Redirecting...</p>
  </div>
</template>

<script setup lang="ts">
await navigateTo('/seller/chat', { external: false })
</script>
