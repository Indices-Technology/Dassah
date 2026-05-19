import { ref, readonly } from 'vue'
import { useAuth } from './useAuth'

export type AIProvider = 'anthropic' | 'openai'

export interface AIConfigState {
  configured: boolean
  provider: AIProvider | null
  model: string | null
  hasKey: boolean
}

export const PROVIDER_MODELS: Record<AIProvider, { label: string; value: string }[]> = {
  anthropic: [
    { label: 'Claude Sonnet 4.6 (Recommended)', value: 'claude-sonnet-4-6' },
    { label: 'Claude Opus 4.7',                 value: 'claude-opus-4-7' },
    { label: 'Claude Haiku 4.5',                value: 'claude-haiku-4-5-20251001' },
  ],
  openai: [
    { label: 'GPT-4o (Recommended)', value: 'gpt-4o' },
    { label: 'GPT-4o Mini',          value: 'gpt-4o-mini' },
    { label: 'GPT-4 Turbo',          value: 'gpt-4-turbo' },
  ],
}

export const useAIConfig = () => {
  const { token } = useAuth()

  const config  = ref<AIConfigState>({ configured: false, provider: null, model: null, hasKey: false })
  const loading = ref(false)
  const error   = ref<string | null>(null)

  const fetch = async () => {
    if (!token.value) return
    loading.value = true
    error.value   = null
    try {
      const data = await $fetch<AIConfigState>('/api/user/ai-config', {
        headers: { Authorization: `Bearer ${token.value}` },
      })
      config.value = data
    } catch (e: any) {
      error.value = e?.data?.statusMessage ?? 'Failed to load AI config'
    } finally {
      loading.value = false
    }
  }

  const save = async (provider: AIProvider, model: string, apiKey: string) => {
    if (!token.value) return
    loading.value = true
    error.value   = null
    try {
      await $fetch('/api/user/ai-config', {
        method:  'PUT',
        headers: { Authorization: `Bearer ${token.value}` },
        body:    { provider, model, apiKey },
      })
      config.value = { configured: true, provider, model, hasKey: true }
    } catch (e: any) {
      error.value = e?.data?.statusMessage ?? 'Failed to save AI config'
      throw e
    } finally {
      loading.value = false
    }
  }

  const remove = async () => {
    if (!token.value) return
    loading.value = true
    error.value   = null
    try {
      await $fetch('/api/user/ai-config', {
        method:  'DELETE',
        headers: { Authorization: `Bearer ${token.value}` },
      })
      config.value = { configured: false, provider: null, model: null, hasKey: false }
    } catch (e: any) {
      error.value = e?.data?.statusMessage ?? 'Failed to remove AI config'
    } finally {
      loading.value = false
    }
  }

  return { config: readonly(config), loading: readonly(loading), error: readonly(error), fetch, save, remove }
}
