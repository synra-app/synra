<script setup lang="ts">
import AppButton from '../base/AppButton.vue'

const manualTarget = defineModel<string>('manualTarget', { required: true })
const socketPort = defineModel<number>('socketPort', { required: true })

defineProps<{
  loading: boolean
  error?: string | null
}>()

const emit = defineEmits<{
  start: []
  stop: []
  refresh: []
}>()
</script>

<template>
  <PanelCard title="Discovery Controls">
    <label class="block">
      <span class="mb-1 block font-semibold text-muted-1">额外 IPv4（逗号分隔，仅作扫描候选）</span>
      <input
        v-model="manualTarget"
        class="app-focus-ring w-full rounded-lg border border-white/14 bg-white/6 px-3 py-2 text-slate-100 placeholder:text-muted-4"
        placeholder="192.168.1.100,192.168.1.101"
      />
    </label>
    <label class="block">
      <span class="mb-1 block font-semibold text-muted-1">WebSocket Port</span>
      <input
        v-model.number="socketPort"
        class="app-focus-ring w-full rounded-lg border border-white/14 bg-white/6 px-3 py-2 text-slate-100 placeholder:text-muted-4"
        type="number"
        min="1"
        max="65535"
        placeholder="32100"
      />
    </label>
    <div class="flex flex-wrap gap-2">
      <AppButton variant="solid" :disabled="loading" @click="emit('start')"> Start Scan </AppButton>
      <AppButton :disabled="loading" @click="emit('stop')"> Stop Scan </AppButton>
      <AppButton :disabled="loading" @click="emit('refresh')"> Refresh </AppButton>
    </div>
    <p v-if="error" class="text-error-4">{{ error }}</p>
  </PanelCard>
</template>
