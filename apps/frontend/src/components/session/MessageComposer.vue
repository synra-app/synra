<script setup lang="ts">
import AppButton from '../base/AppButton.vue'

const messageInput = defineModel<string>('messageInput', { required: true })
const messageType = defineModel<string>('messageType', { required: true })

defineProps<{
  disabled: boolean
  canSend: boolean
}>()

const emit = defineEmits<{
  send: []
}>()
</script>

<template>
  <PanelCard title="Send Message">
    <div class="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto_auto]">
      <input
        v-model="messageInput"
        class="app-focus-ring w-full rounded-lg border border-white/14 bg-white/6 px-3 py-2 text-slate-100 placeholder:text-muted-4"
        :disabled="disabled"
        placeholder="Type a message..."
        @keyup.enter="emit('send')"
      />
      <input
        v-model="messageType"
        class="app-focus-ring rounded-lg border border-white/14 bg-white/6 px-3 py-2 text-slate-100 placeholder:text-muted-4 md:w-40"
        :disabled="disabled"
        placeholder="message type"
      />
      <AppButton variant="solid" :disabled="!canSend" @click="emit('send')"> Send </AppButton>
    </div>
  </PanelCard>
</template>
