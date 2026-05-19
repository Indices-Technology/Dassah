import { ref, computed } from 'vue'
import { useRouter } from '#app'

// ── Singleton state (module-level, shared across all composable calls) ─────────

const accessToken = ref<string | null>(null)
const refreshToken = ref<string | null>(null)
const user = ref<{ id: string; email: string; name: string; picture: string } | null>(null)

// ── Helpers ───────────────────────────────────────────────────────────────────

function persist(key: string, value: string | null) {
  if (!process.client) return
  if (value) localStorage.setItem(key, value)
  else localStorage.removeItem(key)
}

// ── Composable ────────────────────────────────────────────────────────────────

export const useAuth = () => {
  const router = useRouter()

  const isAuthenticated = computed(() => !!accessToken.value)

  // Load tokens from localStorage on first call (SSR-safe)
  const initAuth = () => {
    if (!process.client || accessToken.value) return
    accessToken.value = localStorage.getItem('mx_access_token')
    refreshToken.value = localStorage.getItem('mx_refresh_token')
    const raw = localStorage.getItem('mx_user')
    if (raw) {
      try {
        user.value = JSON.parse(raw)
      } catch {
        user.value = null
      }
    }
  }

  const login = (
    newAccessToken: string,
    newRefreshToken?: string | null,
    userData?: Record<string, any> | null,
  ) => {
    accessToken.value = newAccessToken
    persist('mx_access_token', newAccessToken)

    if (newRefreshToken) {
      refreshToken.value = newRefreshToken
      persist('mx_refresh_token', newRefreshToken)
    }

    if (userData) {
      user.value = userData as typeof user.value
      persist('mx_user', JSON.stringify(userData))
    }

    router.push('/chat')
  }

  const logout = () => {
    accessToken.value = null
    refreshToken.value = null
    user.value = null
    persist('mx_access_token', null)
    persist('mx_refresh_token', null)
    persist('mx_user', null)
    router.push('/')
  }

  // Silently exchange the refresh token for a new access + refresh token pair.
  // Returns true if successful, false if the refresh token is expired/invalid.
  const refresh = async (): Promise<boolean> => {
    const current = refreshToken.value
    if (!current) return false

    try {
      const result = await $fetch<{
        access_token: string
        refresh_token: string
      }>('/api/auth/sso/refresh', {
        method: 'POST',
        body: { refresh_token: current },
      })

      accessToken.value = result.access_token
      persist('mx_access_token', result.access_token)

      refreshToken.value = result.refresh_token
      persist('mx_refresh_token', result.refresh_token)

      return true
    } catch {
      // Refresh token is expired or revoked — force re-login
      logout()
      return false
    }
  }

  return {
    accessToken,
    refreshToken,
    user,
    isAuthenticated,
    initAuth,
    login,
    logout,
    refresh,
    // token alias for backwards compat with existing useSocket / page calls
    token: accessToken,
  }
}
