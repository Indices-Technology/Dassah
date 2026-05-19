<template>
  <div class="rounded-2xl border border-gray-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
    <div class="mb-5 flex items-start justify-between">
      <div>
        <h2 class="text-[15px] font-bold text-gray-900 dark:text-neutral-50">AI Model</h2>
        <p class="mt-0.5 text-[13px] text-gray-500 dark:text-neutral-400">
          Use your own API key. The app works without one — this just routes your chats through your own subscription.
        </p>
      </div>
      <span
        :class="[
          'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold',
          config.configured
            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
            : 'bg-gray-100 text-gray-500 dark:bg-neutral-800 dark:text-neutral-400',
        ]"
      >
        {{ config.configured ? 'Your key active' : 'Platform default' }}
      </span>
    </div>

    <!-- Current config display -->
    <div
      v-if="config.configured"
      class="mb-5 flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3 dark:bg-neutral-800"
    >
      <div class="text-[13px]">
        <span class="font-semibold text-gray-800 dark:text-neutral-200 capitalize">{{ config.provider }}</span>
        <span class="mx-1.5 text-gray-400">·</span>
        <span class="text-gray-600 dark:text-neutral-400">{{ config.model }}</span>
      </div>
      <button
        class="text-[12px] font-semibold text-red-500 hover:text-red-700 dark:hover:text-red-400"
        :disabled="loading"
        @click="handleRemove"
      >
        Remove
      </button>
    </div>

    <!-- Form -->
    <form class="space-y-3" @submit.prevent="handleSave">
      <div>
        <label class="mb-1 block text-[12px] font-semibold text-gray-600 dark:text-neutral-400">Provider</label>
        <select
          v-model="form.provider"
          class="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-[13px] text-gray-900 focus:border-brand/40 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
          @change="form.model = PROVIDER_MODELS[form.provider][0].value"
        >
          <option value="anthropic">Anthropic</option>
          <option value="openai">OpenAI</option>
        </select>
      </div>

      <div>
        <label class="mb-1 block text-[12px] font-semibold text-gray-600 dark:text-neutral-400">Model</label>
        <select
          v-model="form.model"
          class="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-[13px] text-gray-900 focus:border-brand/40 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
        >
          <option v-for="m in PROVIDER_MODELS[form.provider]" :key="m.value" :value="m.value">
            {{ m.label }}
          </option>
        </select>
      </div>

      <div>
        <label class="mb-1 block text-[12px] font-semibold text-gray-600 dark:text-neutral-400">API Key</label>
        <input
          v-model="form.apiKey"
          type="password"
          autocomplete="off"
          :placeholder="config.configured ? '••••••••  (leave blank to keep current)' : 'sk-ant-... or sk-...'"
          class="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-[13px] text-gray-900 placeholder-gray-400 focus:border-brand/40 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder-neutral-500"
        />
      </div>

      <div v-if="error" class="rounded-xl bg-red-50 px-3 py-2 text-[12px] text-red-700 dark:bg-red-950/25 dark:text-red-400">
        {{ error }}
      </div>

      <button
        type="submit"
        :disabled="loading || (!form.apiKey && !config.configured)"
        class="w-full rounded-xl bg-brand py-2.5 text-[13px] font-bold text-white shadow-sm transition hover:opacity-90 disabled:opacity-50"
      >
        {{ loading ? 'Saving…' : config.configured ? 'Update key' : 'Save & activate' }}
      </button>
    </form>

    <p class="mt-4 text-[11px] text-gray-400 dark:text-neutral-600">
      Your key is encrypted at rest and never exposed to the browser after saving.
    </p>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAIConfig, PROVIDER_MODELS } from '../../composables/useAIConfig'
import type { AIProvider } from '../../composables/useAIConfig'

const { config, loading, error, fetch, save, remove } = useAIConfig()

const form = ref<{ provider: AIProvider; model: string; apiKey: string }>({
  provider: 'anthropic',
  model:    'claude-sonnet-4-6',
  apiKey:   '',
})

onMounted(fetch)

async function handleSave() {
  if (!form.value.apiKey && config.value.configured) return
  await save(form.value.provider, form.value.model, form.value.apiKey)
  form.value.apiKey = ''
}

async function handleRemove() {
  if (!confirm('Remove your AI key? The app will use the platform default.')) return
  await remove()
}
</script>
