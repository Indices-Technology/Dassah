<template>
  <div class="bg-gray-100 min-h-screen">
    <ChatWindow />
  </div>
</template>

<script setup lang="ts">
import { onUnmounted } from 'vue'
// useAuth auto-imported from core layer
// useSocket auto-imported from chat layer
// ChatWindow auto-imported from chat layer

definePageMeta({ middleware: 'auth' })

const { token } = useAuth()
const { connect, disconnect } = useSocket()

if (token.value) {
  connect(token.value)
}

onUnmounted(() => {
  disconnect()
})
</script>
