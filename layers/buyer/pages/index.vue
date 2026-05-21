<template>
  <div class="min-h-screen bg-[#0a0f1e] text-white">

    <!-- ── Navbar ─────────────────────────────────────────────────────────────── -->
    <nav class="px-6 py-4 flex items-center justify-between border-b border-white/5">
      <div class="flex items-center gap-2.5">
        <div class="w-8 h-8 rounded-lg bg-[#e52033] flex items-center justify-center text-white text-xs font-black shadow-lg shadow-red-900/40">
          DA
        </div>
        <span class="font-bold text-white tracking-tight">DassaAI</span>
      </div>
      <button
        v-if="!loading"
        :disabled="ssoLoading"
        @click="signInWithMarketX"
        class="px-4 py-1.5 rounded-full bg-white/10 hover:bg-white/15 text-sm font-medium text-white border border-white/10 transition-colors disabled:opacity-50"
      >
        {{ ssoLoading ? 'Redirecting…' : 'Sign in' }}
      </button>
    </nav>

    <!-- ── Hero ──────────────────────────────────────────────────────────────── -->
    <section class="px-6 pt-20 pb-16 max-w-4xl mx-auto text-center">

      <ClientOnly>
        <!-- Error -->
        <div v-if="errorMsg" class="mb-6 inline-flex items-center gap-2 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-2.5 text-sm text-red-400">
          <svg class="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
          </svg>
          {{ errorMsg }}
        </div>

        <!-- SSO loading -->
        <div v-if="loading" class="flex flex-col items-center gap-4 py-8">
          <div class="w-12 h-12 rounded-full border-2 border-[#e52033]/20 border-t-[#e52033] animate-spin" />
          <p class="text-white/50 text-sm">Signing you in…</p>
        </div>
      </ClientOnly>

      <template v-if="!loading">
        <!-- Badge -->
        <div class="inline-flex items-center gap-2 rounded-full bg-[#e52033]/10 border border-[#e52033]/20 px-3 py-1 text-xs font-medium text-[#e52033] mb-6">
          <span class="w-1.5 h-1.5 rounded-full bg-[#e52033] animate-pulse" />
          Powered by AI · MarketX
        </div>

        <h1 class="text-4xl sm:text-6xl font-black tracking-tight leading-none mb-5">
          Shop smarter with
          <span class="block mt-1 bg-gradient-to-r from-[#e52033] to-[#ff7043] bg-clip-text text-transparent">
            conversational AI
          </span>
        </h1>

        <p class="text-white/50 text-lg max-w-xl mx-auto mb-10 leading-relaxed">
          Search products, manage your cart, track orders, and approve payments — all through natural conversation.
        </p>

        <!-- CTA -->
        <button
          :disabled="ssoLoading"
          @click="signInWithMarketX"
          class="inline-flex items-center gap-3 px-7 py-3.5 rounded-2xl bg-[#e52033] hover:bg-[#c71a2a] text-white font-bold text-base shadow-lg shadow-red-900/40 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none"
        >
          <svg v-if="ssoLoading" class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
          </svg>
          <span v-else class="w-6 h-6 rounded-md bg-white/20 flex items-center justify-center text-xs font-black">MX</span>
          {{ ssoLoading ? 'Redirecting…' : 'Continue with MarketX' }}
        </button>

        <p class="mt-3 text-white/25 text-xs">Secure sign-in via MarketX OAuth</p>
      </template>
    </section>

    <!-- ── Skills grid ────────────────────────────────────────────────────────── -->
    <section class="px-6 pb-20 max-w-4xl mx-auto">
      <p class="text-center text-white/30 text-xs font-semibold uppercase tracking-widest mb-8">What DassaAI can do</p>

      <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div
          v-for="skill in skills"
          :key="skill.title"
          class="group relative rounded-2xl bg-white/[0.04] border border-white/[0.07] p-5 hover:bg-white/[0.07] hover:border-white/10 transition-all cursor-default"
        >
          <!-- Glow on hover -->
          <div class="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" :style="`box-shadow: inset 0 0 20px ${skill.color}18`" />

          <div class="relative">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center text-xl mb-3" :style="`background: ${skill.color}18`">
              {{ skill.icon }}
            </div>
            <h3 class="font-bold text-sm text-white/90 mb-1">{{ skill.title }}</h3>
            <p class="text-xs text-white/35 leading-relaxed">{{ skill.desc }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- ── Footer ─────────────────────────────────────────────────────────────── -->
    <footer class="border-t border-white/5 px-6 py-5 text-center text-white/20 text-xs">
      DassaAI · Built on MarketX &middot; AI-powered shopping assistant
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from '#app'

const { login } = useAuth()
const router = useRouter()
const route = useRoute()

const loading = ref(false)
const ssoLoading = ref(false)
const errorMsg = ref<string | null>(null)

const skills = [
  {
    icon: '🔍',
    title: 'Product Search',
    desc: 'Find products by name, category, price range or store across MarketX.',
    color: '#3b82f6',
  },
  {
    icon: '🛒',
    title: 'Cart Management',
    desc: 'Add or remove items, view your cart total, and manage quantities.',
    color: '#10b981',
  },
  {
    icon: '📦',
    title: 'Order Tracking',
    desc: 'Get real-time status updates on any of your active or past orders.',
    color: '#f59e0b',
  },
  {
    icon: '💳',
    title: 'Secure Payments',
    desc: 'Review your order and approve payment with a single confirmation.',
    color: '#e52033',
  },
  {
    icon: '🚚',
    title: 'Shipping & Logistics',
    desc: 'Calculate shipping rates and track deliveries to your door.',
    color: '#8b5cf6',
  },
  {
    icon: '🛡️',
    title: 'Dispute Resolution',
    desc: 'Raise and manage disputes for orders that didn\'t go as expected.',
    color: '#06b6d4',
  },
]

onMounted(() => {
  const ssoToken  = route.query.sso_token   as string | undefined
  const ssoRefresh = route.query.sso_refresh as string | undefined
  const ssoError  = route.query.sso_error   as string | undefined
  const userRaw   = route.query.sso_user    as string | undefined

  if (ssoError) {
    errorMsg.value = `Sign in was cancelled (${ssoError}).`
    return
  }

  if (ssoToken) {
    loading.value = true
    try {
      let userData: Record<string, any> | undefined
      if (userRaw) {
        try { userData = JSON.parse(userRaw) } catch { /* ignore */ }
      }
      const redirectTo = (route.query.redirect as string) || '/chat'
      login(ssoToken, ssoRefresh ?? null, userData ?? null)
      if (redirectTo !== '/chat') router.replace(redirectTo)
    } catch {
      errorMsg.value = 'Failed to complete sign-in. Please try again.'
      loading.value = false
    }
  }
})

async function signInWithMarketX() {
  ssoLoading.value = true
  errorMsg.value = null
  try {
    const result = await $fetch<{ authorizeUrl: string }>('/api/auth/sso', {
      method: 'POST',
      body: { redirect_after: '/chat' },
    })
    window.location.assign(result.authorizeUrl)
  } catch (e: any) {
    errorMsg.value = e?.data?.statusMessage ?? 'Could not initiate sign-in. Please try again.'
    ssoLoading.value = false
  }
}
</script>
