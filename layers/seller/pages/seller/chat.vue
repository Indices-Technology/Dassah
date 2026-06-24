<template>
  <div class="flex h-[100dvh] bg-slate-950 text-white overflow-hidden">

    <!-- ── Desktop sidebar ───────────────────────────────────────────────── -->
    <aside class="hidden md:flex flex-col w-64 shrink-0 bg-slate-900 border-r border-white/[0.05]">

      <!-- Brand + store switcher -->
      <div class="px-4 py-4 flex items-center gap-3 border-b border-white/[0.05]">
        <div class="w-9 h-9 rounded-xl bg-[#e52033] flex items-center justify-center text-white text-xs font-black shadow-lg shadow-red-900/40 shrink-0">
          DA
        </div>
        <div class="flex-1 min-w-0">
          <div class="text-sm font-bold text-white leading-tight">Dasah</div>
          <div class="text-[10px] text-slate-500 font-semibold uppercase tracking-widest">Seller Mode</div>
        </div>
      </div>

      <!-- Store switcher (desktop) -->
      <div v-if="activeStore" class="px-3 py-3 border-b border-white/[0.05]">
        <p class="text-[10px] font-semibold uppercase tracking-widest text-slate-600 px-2 mb-2">Active Store</p>
        <StoreSwitcher
          :stores="stores"
          :active-store="activeStore"
          @select="onStoreSelect"
        />
      </div>

      <!-- Conversation history -->
      <div class="flex-1 px-3 py-3 overflow-y-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
        <div class="flex items-center justify-between px-2 mb-2">
          <p class="text-[10px] font-semibold uppercase tracking-widest text-slate-600">History</p>
          <button
            v-if="sellerConversations.length > 0"
            @click="clearAllConversations"
            class="text-[10px] text-slate-600 hover:text-red-400 transition-colors"
          >
            Clear
          </button>
        </div>

        <div v-if="sellerConversations.length === 0" class="px-2 py-3 text-[11px] text-slate-600 text-center">
          No conversations yet
        </div>

        <div v-else class="space-y-0.5">
          <button
            v-for="conv in sellerConversations"
            :key="conv.sessionId"
            @click="loadConversation(conv.sessionId)"
            class="w-full flex items-start gap-2.5 px-3 py-2.5 rounded-xl text-left transition-colors group hover:bg-white/[0.06]"
            :class="conv.sessionId === sessionId ? 'bg-white/[0.08]' : ''"
          >
            <div class="w-5 h-5 rounded-md bg-slate-700 flex items-center justify-center text-[10px] shrink-0 mt-0.5 text-slate-300 font-bold uppercase">
              {{ conv.storeName ? conv.storeName.slice(0, 2) : '🏪' }}
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-[12px] text-slate-300 truncate leading-tight group-hover:text-white transition-colors">{{ conv.title }}</p>
              <p class="text-[10px] text-slate-600 truncate mt-0.5">{{ conv.storeName || 'Seller' }}</p>
            </div>
          </button>
        </div>
      </div>

      <!-- User footer -->
      <div class="px-3 pb-4 border-t border-white/[0.05] pt-3 space-y-3">
        <div class="flex items-center gap-2.5 px-2">
          <img
            :src="avatarSrc"
            :alt="user?.name ?? 'User'"
            class="w-8 h-8 rounded-full object-cover ring-2 ring-white/10 shrink-0"
            @error="onAvatarError"
          />
          <div class="flex-1 min-w-0">
            <p class="text-[13px] font-semibold text-slate-200 truncate leading-tight">{{ user?.name || 'Seller' }}</p>
            <p class="text-[11px] text-slate-500 truncate">{{ user?.email || '' }}</p>
          </div>
          <button
            @click="handleLogout"
            title="Sign out"
            class="w-7 h-7 rounded-lg flex items-center justify-center text-slate-600 hover:text-red-400 hover:bg-red-400/10 transition-colors shrink-0"
          >
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>

        <button
          @click="switchToBuyer"
          class="w-full py-2 rounded-xl text-xs font-semibold text-[#e52033] border border-[#e52033]/20 hover:bg-[#e52033]/10 transition-colors"
        >
          Switch to Buyer Mode
        </button>
      </div>
    </aside>

    <!-- ── Main area ─────────────────────────────────────────────────────── -->
    <div class="flex flex-col flex-1 min-w-0">

      <!-- Header -->
      <header class="shrink-0 bg-slate-900 border-b border-white/[0.05] px-4 py-3 flex items-center gap-3">

        <!-- Mobile: brand mark -->
        <div class="flex md:hidden items-center gap-2 shrink-0">
          <div class="w-8 h-8 rounded-lg bg-[#e52033] flex items-center justify-center text-white text-[11px] font-black shadow shadow-red-900/40">
            DA
          </div>
        </div>

        <!-- Title / store info -->
        <div class="flex-1 min-w-0">
          <!-- No store yet -->
          <template v-if="!activeStore">
            <span class="text-[14px] font-bold text-white">Choose a store</span>
          </template>
          <!-- Store selected: show store switcher on mobile -->
          <template v-else>
            <div class="md:hidden">
              <StoreSwitcher
                :stores="stores"
                :active-store="activeStore"
                @select="onStoreSelect"
              />
            </div>
            <div class="hidden md:flex items-center gap-2">
              <span class="text-[14px] font-bold text-white truncate">{{ activeStore.store_name }}</span>
              <span class="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest bg-emerald-900/50 text-emerald-400">
                Seller
              </span>
            </div>
          </template>
        </div>

        <!-- Connection dot -->
        <div
          :class="['w-2 h-2 rounded-full shrink-0 transition-colors', isConnected ? 'bg-emerald-400 shadow-sm shadow-emerald-500/40' : 'bg-slate-600 animate-pulse']"
        />

        <!-- New chat (when in chat view) -->
        <button
          v-if="activeStore && messages.length > 0"
          @click="startNewConversation"
          title="New conversation"
          class="w-8 h-8 rounded-xl flex items-center justify-center text-slate-500 hover:text-white hover:bg-white/[0.08] transition-colors shrink-0"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </button>

        <!-- Buyer toggle (mobile) -->
        <button
          @click="switchToBuyer"
          class="md:hidden text-[11px] px-3 py-1.5 rounded-full border border-[#e52033]/25 text-[#e52033] hover:bg-[#e52033]/10 transition shrink-0"
        >
          Buyer
        </button>

        <!-- Avatar / logout (mobile) -->
        <button @click="handleLogout" class="md:hidden shrink-0" title="Sign out">
          <img
            :src="avatarSrc"
            :alt="user?.name ?? 'User'"
            class="w-8 h-8 rounded-full object-cover ring-2 ring-white/10"
            @error="onAvatarError"
          />
        </button>
      </header>

      <!-- ── View: Store picker ─────────────────────────────────────────── -->
      <StorePickerGrid
        v-if="!activeStore"
        :stores="stores"
        :loading="storeLoading"
        :error="storeError"
        @select="onStoreSelect"
        @retry="fetchStores"
        class="flex-1"
      />

      <!-- ── View: Dashboard (store selected, no messages) ──────────────── -->
      <SellerDashboard
        v-else-if="messages.length === 0"
        :store-id="activeStore.id"
        :store-name="activeStore.store_name"
        @action="sendQuickAction"
        class="flex-1"
      />

      <!-- ── View: Chat (messages exist) ───────────────────────────────── -->
      <template v-else>
        <main
          ref="scrollContainer"
          class="flex-1 overflow-y-auto px-4 py-4 scroll-smooth"
        >
          <div class="space-y-1 max-w-2xl mx-auto">
            <MessageBubble
              v-for="msg in messages"
              :key="msg.id"
              :message="msg"
              @approve="approvePayment"
              @addToCart="handleAddToCart"
              @quickReply="sendQuickAction"
            />
            <div v-if="isTyping" class="flex items-center gap-1 ml-2 mt-2 mb-2">
              <div class="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-slate-800 border border-slate-700/80 px-3.5 py-2.5">
                <span class="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style="animation-delay:0s" />
                <span class="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style="animation-delay:0.15s" />
                <span class="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style="animation-delay:0.3s" />
              </div>
            </div>
          </div>
        </main>

        <!-- Mobile quick action chips (chat view) -->
        <div class="md:hidden shrink-0 px-3 pb-2 overflow-x-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
          <div class="flex gap-1.5 w-max">
            <button
              v-for="chip in quickChips"
              :key="chip.label"
              @click="sendQuickAction(chip.prompt)"
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-800 border border-slate-700 text-[11px] text-slate-300 hover:border-slate-600 hover:text-white transition-colors whitespace-nowrap active:scale-95"
            >
              <span class="text-[12px] leading-none">{{ chip.icon }}</span>
              {{ chip.label }}
            </button>
          </div>
        </div>
      </template>

      <!-- ── Input bar (only when store selected) ───────────────────────── -->
      <div v-if="activeStore" class="shrink-0 bg-slate-900 border-t border-white/[0.05] px-4 py-3">
        <div class="max-w-2xl mx-auto">
          <!-- Pending image uploads -->
          <div v-if="pendingImages.length || uploadingImage" class="flex gap-2 mb-2">
            <div v-for="(a, i) in pendingImages" :key="a.public_id" class="relative">
              <img :src="a.url" class="h-14 w-14 rounded-lg object-cover border border-slate-700" />
              <button
                type="button"
                class="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-700 text-xs text-white"
                @click="pendingImages.splice(i, 1)"
              >×</button>
            </div>
            <div v-if="uploadingImage" class="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-slate-700 text-xs text-slate-500">
              uploading…
            </div>
          </div>

          <div class="flex items-center gap-2">
            <input ref="imageInput" type="file" accept="image/*" class="hidden" @change="onImageSelect" />
            <button
              type="button"
              :disabled="!isConnected || uploadingImage"
              class="shrink-0 p-1 text-slate-400 transition hover:text-[#e52033] disabled:opacity-50"
              title="Attach product image"
              @click="imageInput?.click()"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="h-5 w-5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
              </svg>
            </button>
          <input
            v-model="inputText"
            @keyup.enter="handleSend"
            :disabled="!isConnected"
            placeholder="Ask about your store, orders or campaigns…"
            class="flex-1 bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#e52033]/50 focus:ring-2 focus:ring-[#e52033]/15 disabled:opacity-50 transition"
          />
          <button
            @click="handleSend"
            :disabled="!isConnected || (!inputText.trim() && !pendingImages.length) || uploadingImage"
            class="bg-[#e52033] text-white rounded-2xl p-2.5 flex items-center justify-center disabled:opacity-40 hover:bg-[#c01020] active:scale-90 transition-all shadow-sm shadow-[#e52033]/30 shrink-0"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5 ml-0.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
            </svg>
          </button>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onUnmounted, computed } from 'vue'
import MessageBubble from '../../../chat/components/chat/MessageBubble.vue'
import StorePickerGrid from '../../components/seller/StorePickerGrid.vue'
import StoreSwitcher from '../../components/seller/StoreSwitcher.vue'
import SellerDashboard from '../../components/seller/SellerDashboard.vue'
import { useSellerStores } from '../../composables/useSellerStores'
import type { SellerStoreSummary } from '../../composables/useSellerStores'
import type { ProductItem } from '../../../chat/composables/useChat'
import { useConversations } from '../../../chat/composables/useConversations'

definePageMeta({ middleware: ['auth'] })

const { token, user, logout } = useAuth()
const { isConnected, connect, disconnect, socket } = useSocket()
const { messages, isTyping, sessionId, sendMessage, approvePayment, clearMessages, setupListeners } = useChat()
const {
  stores, activeStore, loading: storeLoading, error: storeError,
  fetchStores, setActiveStore,
} = useSellerStores()
const { conversations, upsert, remove, clear } = useConversations()

const inputText = ref('')
const scrollContainer = ref<HTMLElement | null>(null)

// ── Computed ──────────────────────────────────────────────────────────────────

const sellerConversations = computed(() =>
  conversations.value.filter(c => c.mode === 'seller')
)

const avatarSrc = computed(() =>
  user.value?.picture ||
  `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(user.value?.name || user.value?.email || 'U')}`
)

const quickChips = [
  { icon: '📊', label: "Today's stats",  prompt: "Show me today's sales summary." },
  { icon: '📦', label: 'Pending orders', prompt: 'List all pending orders.' },
  { icon: '⚠️', label: 'Low stock',      prompt: 'Which products are running low on stock?' },
]

// ── Store selection ───────────────────────────────────────────────────────────

function onStoreSelect(store: SellerStoreSummary) {
  // No-op if re-selecting the store we're already on.
  if (activeStore.value?.id === store.id) return

  setActiveStore(store.id)
  // Inform the AI worker which store context we're in
  socket.value?.emit('session:store', {
    storeId: store.id,
    storeName: store.store_name,
    storeSlug: store.store_slug,
  })

  // A different store is a different context. History is one rolling log per user,
  // so reset the chat — clear what's on screen and start a fresh conversation —
  // otherwise the previous store's messages bleed into this store's answers.
  clearMessages()
  socket.value?.emit('chat:new')
  conversationTitled = false
}

// ── Conversation management ───────────────────────────────────────────────────

let conversationTitled = false

watch(messages, (msgs) => {
  if (conversationTitled || !sessionId.value || !activeStore.value) return
  const firstUser = msgs.find(m => m.role === 'user')
  if (firstUser) {
    upsert(sessionId.value, firstUser.content, 'seller', activeStore.value.id, activeStore.value.store_name)
    conversationTitled = true
  }
}, { deep: true })

watch(sessionId, () => { conversationTitled = false })

function startNewConversation() {
  clearMessages()
  socket.value?.emit('chat:new')
}

function loadConversation(sid: string) {
  clearMessages()
  socket.value?.emit('chat:load', { sessionId: sid })
}

function clearAllConversations() {
  clear()
}

// ── Chat helpers ──────────────────────────────────────────────────────────────

// ── Image upload (attach to a product on create) ──────────────────────────────
interface PendingImage { url: string; public_id: string; type?: string }
const imageInput = ref<HTMLInputElement | null>(null)
const pendingImages = ref<PendingImage[]>([])
const uploadingImage = ref(false)

async function onImageSelect(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  uploadingImage.value = true
  try {
    const fd = new FormData()
    fd.append('file', file)
    const res = await $fetch<{ data?: PendingImage }>('/api/media/upload', {
      method: 'POST',
      body: fd,
      headers: { Authorization: `Bearer ${token.value}` },
    })
    if (res?.data?.url) pendingImages.value.push(res.data)
  } catch (err) {
    console.error('[upload] failed', err)
  } finally {
    uploadingImage.value = false
    if (imageInput.value) imageInput.value.value = ''
  }
}

function handleSend() {
  if ((!inputText.value.trim() && !pendingImages.value.length) || !isConnected.value || uploadingImage.value) return
  sendMessage(inputText.value.trim(), pendingImages.value.length ? [...pendingImages.value] : undefined)
  inputText.value = ''
  pendingImages.value = []
}

function sendQuickAction(prompt: string) {
  if (!isConnected.value) return
  sendMessage(prompt)
}

function handleAddToCart(product: ProductItem) {
  sendMessage(`Add "${product.name}" to my cart. productId: ${product.id}`)
}

function switchToBuyer() {
  navigateTo('/chat')
}

function handleLogout() {
  logout()
}

function onAvatarError(e: Event) {
  const img = e.target as HTMLImageElement
  img.src = `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(user.value?.name || 'S')}`
}

// ── Scroll to bottom ──────────────────────────────────────────────────────────

watch(() => messages.value.length, async () => {
  await nextTick()
  scrollContainer.value?.scrollTo(0, scrollContainer.value.scrollHeight)
})

// ── Lifecycle ─────────────────────────────────────────────────────────────────

onMounted(async () => {
  await fetchStores()

  if (token.value) {
    connect(token.value, () => {
      socket.value?.emit('session:type', 'seller')
      // Re-emit store context if already selected (e.g. page refresh)
      if (activeStore.value) {
        socket.value?.emit('session:store', {
          storeId: activeStore.value.id,
          storeName: activeStore.value.store_name,
          storeSlug: activeStore.value.store_slug,
        })
      }
    })
  }

  setupListeners()
})

onUnmounted(() => {
  disconnect()
})
</script>
