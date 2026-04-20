<script setup lang="ts">
import PanelCard from '../layout/PanelCard.vue'

const messageInput = defineModel<string>('messageInput', { required: true })
const messageType = defineModel<string>('messageType', { required: true })

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
  <PanelCard title="Message Composer">
    <div class="space-y-3">
      <label class="text-xs font-medium tracking-wide text-slate-300">Message</label>
      <textarea
        v-model="messageInput"
        class="app-focus-ring max-h-40 min-h-28 w-full resize-y rounded-xl border border-white/14 bg-white/6 px-3 py-2 text-slate-100 placeholder:text-slate-400"
        :disabled="disabled"
        placeholder="Type a message..."
        @keydown.enter.exact.prevent="emit('send')"
      />

      <div class="flex flex-wrap gap-2">
        <label class="sr-only" for="messageTypeInput">Message Type</label>
        <input
          id="messageTypeInput"
          v-model="messageType"
          class="app-focus-ring min-w-40 flex-1 rounded-xl border border-white/14 bg-white/6 px-3 py-2 text-slate-100 placeholder:text-slate-400"
          :disabled="disabled"
          placeholder="message type"
        />
        <button
          class="app-focus-ring rounded-xl bg-indigo-500/90 px-4 py-2 text-white transition-all duration-200 hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="!canSend"
          @click="emit('send')"
        >
          {{ sending ? 'Sending...' : 'Send' }}
        </button>
      </div>

      <p v-if="error" class="text-xs text-rose-300">{{ error }}</p>
      <p v-else class="text-xs text-slate-400">Press Enter to send, Shift+Enter for new line.</p>
    </div>
  </PanelCard>
</template>
