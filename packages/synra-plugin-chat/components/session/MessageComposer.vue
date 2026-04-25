<script setup lang="ts">
const messageInput = defineModel<string>('messageInput', { required: true })

defineProps<{
  disabled: boolean
  canSend: boolean
  sending: boolean
  error?: string | null
}>()

const emit = defineEmits<{
  send: []
}>()
</script>

<template>
  <div class="space-y-1.5">
    <div class="flex items-end gap-2 lg:hidden">
      <label class="sr-only" for="synra-chat-input-m">消息</label>
      <textarea
        id="synra-chat-input-m"
        v-model="messageInput"
        rows="1"
        class="app-focus-ring max-h-32 min-h-[2.75rem] flex-1 resize-y rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-muted-2"
        :disabled="disabled"
        placeholder="输入消息…"
        @keydown.enter.exact.prevent="emit('send')"
      />
      <button
        type="button"
        class="app-focus-ring h-[2.75rem] shrink-0 rounded-xl bg-primary px-3 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        :disabled="!canSend"
        @click="emit('send')"
      >
        {{ sending ? '…' : '发送' }}
      </button>
    </div>

    <div
      class="relative hidden rounded-2xl border border-white/10 bg-white/5 px-3 pb-10 pt-2 lg:block"
    >
      <label class="sr-only" for="synra-chat-input-d">消息</label>
      <textarea
        id="synra-chat-input-d"
        v-model="messageInput"
        rows="3"
        class="app-focus-ring w-full resize-none border-0 bg-transparent text-sm text-slate-100 outline-none placeholder:text-muted-2"
        :disabled="disabled"
        placeholder="输入消息…"
        @keydown.enter.exact.prevent="emit('send')"
      />
      <button
        type="button"
        class="app-focus-ring absolute bottom-2 right-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        :disabled="!canSend"
        @click="emit('send')"
      >
        {{ sending ? '发送中' : '发送' }}
      </button>
    </div>

    <p v-if="error" class="px-0.5 text-xs text-rose-300">{{ error }}</p>
    <p v-else class="hidden px-0.5 text-[11px] text-muted-2/70 lg:block">
      Enter 发送，Shift+Enter 换行
    </p>
  </div>
</template>

<style scoped>
@media (min-width: 1024px) {
  #synra-chat-input-d {
    resize: none !important;
  }
}
</style>
