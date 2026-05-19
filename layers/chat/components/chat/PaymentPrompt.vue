<template>
  <div class="mt-3 p-4 bg-white rounded-lg border border-gray-200 shadow-sm text-gray-800">
    <div class="font-semibold mb-1 text-base">Confirm Purchase</div>
    <p class="text-sm mb-4 text-gray-600">Please approve the payment to continue processing your order.</p>

    <div class="flex flex-col gap-2 sm:flex-row">
      <a
        :href="metadata.paymentUrl"
        target="_blank"
        rel="noopener"
        class="flex-1 bg-gray-800 text-white text-center py-2 px-4 rounded text-sm font-medium hover:bg-gray-700 transition"
      >
        Pay Now
      </a>
      <button
        @click="$emit('approve')"
        class="flex-1 bg-blue-600 text-white text-center py-2 px-4 rounded text-sm font-medium hover:bg-blue-700 transition"
      >
        I've Paid
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ metadata: any }>()
defineEmits(['approve'])
</script>
