<template>
  <header class="shrink-0 bg-white border-b border-gray-200">
    <!-- Brand accent stripe — same pattern as MarketX ProfileHeader -->
    <div class="h-[3px] w-full bg-[#e52033]" />

    <div class="px-4 py-3 flex items-center gap-3">
      <!-- DassaAI identity -->
      <div class="relative shrink-0">
        <div class="w-10 h-10 rounded-full bg-[#e52033] flex items-center justify-center shadow-sm ring-2 ring-red-100">
          <span class="text-white text-[13px] font-bold tracking-tight">DA</span>
        </div>
        <!-- Online dot -->
        <span
          :class="[
            'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ring-2 ring-white',
            isConnected ? 'bg-emerald-500' : 'bg-gray-300',
          ]"
        />
      </div>

      <!-- Bot name + mode -->
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-1.5">
          <span class="text-[15px] font-bold leading-tight text-gray-900 truncate">DassaAI</span>
          <!-- Session mode badge — mirrors MarketX seller badge style -->
          <span
            :class="[
              'inline-flex select-none items-center rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest',
              sessionMode === 'seller'
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-blue-100 text-blue-700',
            ]"
          >
            {{ sessionMode === 'seller' ? 'Seller' : 'Buyer' }}
          </span>
        </div>
        <p class="text-[11px] text-gray-400 leading-tight">MarketX Shopping Assistant</p>
      </div>

      <!-- Session toggle + user avatar -->
      <div class="flex items-center gap-2 shrink-0">
        <!-- Buyer / Seller toggle -->
        <div class="flex items-center bg-gray-100 rounded-full p-0.5 gap-0.5">
          <button
            v-for="mode in (['buyer', 'seller'] as const)"
            :key="mode"
            @click="setMode(mode)"
            :class="[
              'px-3 py-1 rounded-full text-[11px] font-semibold transition-all capitalize',
              sessionMode === mode
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700',
            ]"
          >
            {{ mode }}
          </button>
        </div>

        <!-- User avatar — DiceBear fallback same as MarketX -->
        <div class="relative shrink-0 cursor-pointer" :title="user?.name ?? user?.email ?? ''">
          <img
            :src="user?.picture || `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(user?.name || user?.email || 'U')}`"
            :alt="user?.name ?? 'User'"
            class="w-8 h-8 rounded-full object-cover ring-2 ring-gray-100"
            @error="onAvatarError"
          />
        </div>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { ref } from 'vue'

// Both composables are auto-imported by Nuxt across layers
const { user } = useAuth()
const { isConnected, socket } = useSocket()

const sessionMode = ref<'buyer' | 'seller'>('buyer')

function setMode(mode: 'buyer' | 'seller') {
  sessionMode.value = mode
  socket.value?.emit('session:type', mode)
}

function onAvatarError(e: Event) {
  const img = e.target as HTMLImageElement
  img.src = `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(user.value?.name || 'U')}`
}
</script>
