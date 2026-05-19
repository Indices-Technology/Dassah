<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-md w-full space-y-8 bg-white p-10 rounded-2xl shadow-xl border border-gray-100">
      <!-- Logo + heading -->
      <div>
        <div
          class="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-2xl mx-auto shadow-lg"
        >
          DA
        </div>
        <h2 class="mt-6 text-center text-3xl font-extrabold text-gray-900">Welcome to DassaAI</h2>
        <p class="mt-2 text-center text-sm text-gray-500">Your intelligent MarketX shopping assistant</p>
      </div>

      <!-- Error banner -->
      <div
        v-if="errorMsg"
        class="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
      >
        {{ errorMsg }}
      </div>

      <!-- SSO callback in progress -->
      <div v-if="loading" class="flex flex-col items-center gap-3 py-6">
        <svg class="h-8 w-8 animate-spin text-blue-600" viewBox="0 0 24 24" fill="none">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
        <p class="text-sm text-gray-500">Signing you in…</p>
      </div>

      <!-- Sign in button -->
      <div v-else class="mt-4 space-y-4">
        <button
          type="button"
          :disabled="ssoLoading"
          class="group relative w-full flex justify-center items-center gap-3 py-3 px-4 border border-transparent text-sm font-semibold rounded-xl text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors disabled:opacity-60"
          @click="signInWithMarketX"
        >
          <svg v-if="ssoLoading" class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          <span
            v-else
            class="w-6 h-6 rounded-md bg-white/20 flex items-center justify-center text-xs font-black"
          >
            MX
          </span>
          {{ ssoLoading ? 'Redirecting…' : 'Sign in with MarketX' }}
        </button>

        <p class="text-center text-xs text-gray-400">
          You'll be redirected to MarketX to sign in securely.
        </p>
      </div>
    </div>
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

// ── Handle SSO callback params ─────────────────────────────────────────────────
onMounted(() => {
  const ssoToken = route.query.sso_token as string | undefined
  const ssoRefresh = route.query.sso_refresh as string | undefined
  const ssoError = route.query.sso_error as string | undefined
  const userRaw = route.query.sso_user as string | undefined

  if (ssoError) {
    errorMsg.value = `Sign in was cancelled (${ssoError}).`
    return
  }

  if (ssoToken) {
    loading.value = true
    try {
      let userData: Record<string, any> | undefined
      if (userRaw) {
        try {
          userData = JSON.parse(userRaw)
        } catch { /* ignore */ }
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

// ── Initiate sign-in flow ──────────────────────────────────────────────────────
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
