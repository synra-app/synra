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
    <div class="space-y-2">
      <textarea
        v-model="messageInput"
        class="max-h-40 min-h-24 w-full resize-y rounded-md border border-gray-300 px-3 py-2"
        :disabled="disabled"
        placeholder="Type a message..."
        @keydown.enter.exact.prevent="emit('send')"
      />

      <div class="flex flex-wrap gap-2">
        <input
          v-model="messageType"
          class="min-w-40 flex-1 rounded-md border border-gray-300 px-3 py-2"
          :disabled="disabled"
          placeholder="message type"
        />
        <button
          class="rounded-md bg-gray-900 px-4 py-2 text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="!canSend"
          @click="emit('send')"
        >
          {{ sending ? 'Sending...' : 'Send' }}
        </button>
      </div>

      <p v-if="error" class="text-xs text-red-600">{{ error }}</p>
      <p v-else class="text-xs text-gray-500">Press Enter to send, Shift+Enter for new line.</p>
    </div>
  </PanelCard>
</template>
