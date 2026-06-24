<template>
  <header class="shrink-0 bg-white border-b border-gray-200">
    <div class="h-[3px] w-full bg-[#e52033]" />

    <div class="px-4 py-3 flex items-center gap-3">
      <!-- Sidebar toggle (mobile only — desktop sidebar is always visible) -->
      <button
        @click="$emit('toggle-sidebar')"
        class="sm:hidden w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors shrink-0 -ml-1"
        title="Conversation history"
      >
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <!-- DassaAI identity -->
      <div class="relative shrink-0">
        <div class="w-10 h-10 rounded-full bg-[#e52033] flex items-center justify-center shadow-sm ring-2 ring-red-100">
          <span class="text-white text-[13px] font-bold tracking-tight">DA</span>
        </div>
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
          <span class="text-[15px] font-bold leading-tight text-gray-900 truncate">Dasah</span>
          <span
            :class="[
              'inline-flex select-none items-center rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest',
              sessionMode === 'seller'
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-red-50 text-[#e52033]',
            ]"
          >
            {{ sessionMode === 'seller' ? 'Seller' : 'Buyer' }}
          </span>
        </div>
        <p class="text-[11px] text-gray-400 leading-tight">
          {{ isConnected ? 'Online · MarketX Assistant' : 'Connecting…' }}
        </p>
      </div>

      <!-- Session toggle + profile -->
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

        <!-- Profile avatar + dropdown -->
        <div class="relative" ref="profileRef">
          <button
            @click="toggleMenu"
            class="flex items-center gap-1.5 rounded-full focus:outline-none focus:ring-2 focus:ring-[#e52033]/30"
            :title="user?.name ?? user?.email ?? 'Profile'"
          >
            <img
              :src="avatarSrc"
              :alt="user?.name ?? 'User'"
              class="w-8 h-8 rounded-full object-cover ring-2 ring-gray-100"
              @error="onAvatarError"
            />
            <svg
              :class="['w-3 h-3 text-gray-400 transition-transform', showMenu ? 'rotate-180' : '']"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          <!-- Dropdown -->
          <Transition
            enter-active-class="transition ease-out duration-100"
            enter-from-class="opacity-0 scale-95 translate-y-1"
            enter-to-class="opacity-100 scale-100 translate-y-0"
            leave-active-class="transition ease-in duration-75"
            leave-from-class="opacity-100 scale-100 translate-y-0"
            leave-to-class="opacity-0 scale-95 translate-y-1"
          >
            <div
              v-if="showMenu"
              class="absolute right-0 mt-2 w-60 rounded-2xl bg-white shadow-xl border border-gray-100 z-50 overflow-hidden"
            >
              <!-- User info -->
              <div class="px-4 py-3.5 border-b border-gray-100 flex items-center gap-3">
                <img
                  :src="avatarSrc"
                  :alt="user?.name ?? 'User'"
                  class="w-10 h-10 rounded-full object-cover ring-2 ring-gray-100 shrink-0"
                  @error="onAvatarError"
                />
                <div class="min-w-0">
                  <p class="text-sm font-semibold text-gray-900 truncate">{{ user?.name || 'User' }}</p>
                  <p class="text-xs text-gray-400 truncate">{{ user?.email || '' }}</p>
                </div>
              </div>

              <!-- Menu items -->
              <div class="py-1.5">
                <button
                  @click="goToAISettings"
                  class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left"
                >
                  <span class="w-7 h-7 rounded-lg bg-purple-50 flex items-center justify-center shrink-0">
                    <svg class="w-3.5 h-3.5 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2h-2" />
                    </svg>
                  </span>
                  AI Model Settings
                </button>

                <button
                  @click="clearHistory"
                  class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left"
                >
                  <span class="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                    <svg class="w-3.5 h-3.5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </span>
                  Clear chat history
                </button>
              </div>

              <!-- Sign out -->
              <div class="border-t border-gray-100 py-1.5">
                <button
                  @click="handleLogout"
                  class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors text-left"
                >
                  <span class="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
                    <svg class="w-3.5 h-3.5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                  </span>
                  Sign out
                </button>
              </div>
            </div>
          </Transition>
        </div>
      </div>
    </div>
  </header>

  <!-- Click-outside overlay -->
  <div v-if="showMenu" class="fixed inset-0 z-40" @click="showMenu = false" />
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from '#app'

defineEmits<{ 'toggle-sidebar': [] }>()

const { user, logout } = useAuth()
const { isConnected, socket } = useSocket()
const router = useRouter()

const sessionMode = ref<'buyer' | 'seller'>('buyer')
const showMenu = ref(false)
const profileRef = ref<HTMLElement | null>(null)

const avatarSrc = computed(() =>
  user.value?.picture ||
  `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(user.value?.name || user.value?.email || 'U')}`
)

function setMode(mode: 'buyer' | 'seller') {
  if (mode === 'seller') {
    router.push('/seller/chat')
  } else {
    sessionMode.value = 'buyer'
    socket.value?.emit('session:type', 'buyer')
    // Socket stays connected on a mode switch, so the connect-time `chat:history`
    // never re-fires — explicitly re-request it, or the conversation looks empty
    // until a full refresh+reconnect.
    socket.value?.emit('chat:load', { sessionId: '' })
  }
}

function toggleMenu() {
  showMenu.value = !showMenu.value
}

function onAvatarError(e: Event) {
  const img = e.target as HTMLImageElement
  img.src = `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(user.value?.name || 'U')}`
}

function goToAISettings() {
  showMenu.value = false
  router.push('/settings')
}

function clearHistory() {
  showMenu.value = false
  // Emit a custom event that ChatWindow can listen to
  socket.value?.emit('chat:clear')
  window.location.reload()
}

function handleLogout() {
  showMenu.value = false
  logout()
}
</script>
