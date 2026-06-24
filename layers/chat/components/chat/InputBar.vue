<template>
  <div class="bg-white border-t border-gray-100">
    <!-- Pending image previews -->
    <div v-if="pending.length || uploading" class="flex gap-2 px-3 pt-2">
      <div v-for="(a, i) in pending" :key="a.public_id" class="relative">
        <img :src="a.url" class="h-14 w-14 rounded-lg object-cover border border-gray-200" />
        <button
          type="button"
          class="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-gray-800 text-xs text-white"
          @click="pending.splice(i, 1)"
        >×</button>
      </div>
      <div v-if="uploading" class="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-gray-300 text-xs text-gray-400">
        uploading…
      </div>
    </div>

    <div class="p-3 flex items-center gap-2">
      <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="onFile" />
      <button
        type="button"
        :disabled="disabled || uploading"
        class="p-1 text-gray-400 transition hover:text-[#e52033] disabled:opacity-50"
        title="Attach image"
        @click="fileInput?.click()"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="h-5 w-5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
        </svg>
      </button>

      <input
        v-model="text"
        type="text"
        placeholder="Ask Dasah…"
        class="flex-1 rounded-full border border-gray-200 px-4 py-2.5 text-sm transition focus:border-[#e52033]/40 focus:outline-none focus:ring-2 focus:ring-[#e52033]/15"
        :disabled="disabled"
        @keyup.enter="send"
      />

      <button
        type="button"
        :disabled="(!text.trim() && !pending.length) || disabled || uploading"
        class="flex items-center justify-center rounded-full bg-[#e52033] p-2.5 text-white shadow-sm shadow-[#e52033]/30 transition-all hover:bg-[#c01020] active:scale-90 disabled:cursor-not-allowed disabled:opacity-50"
        @click="send"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="ml-0.5 h-5 w-5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

interface Attachment { url: string; public_id: string; type?: string }

defineProps<{ disabled?: boolean }>()
const emit = defineEmits<{ send: [text: string, attachments?: Attachment[]] }>()

const text = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const pending = ref<Attachment[]>([])
const uploading = ref(false)

const { token } = useAuth()

async function onFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  uploading.value = true
  try {
    const fd = new FormData()
    fd.append('file', file)
    const res = await $fetch<{ data?: Attachment }>('/api/media/upload', {
      method: 'POST',
      body: fd,
      headers: { Authorization: `Bearer ${token.value}` },
    })
    if (res?.data?.url) pending.value.push(res.data)
  } catch (err) {
    console.error('[upload] failed', err)
  } finally {
    uploading.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
}

const send = () => {
  if ((!text.value.trim() && !pending.value.length) || uploading.value) return
  emit('send', text.value, pending.value.length ? [...pending.value] : undefined)
  text.value = ''
  pending.value = []
}
</script>
