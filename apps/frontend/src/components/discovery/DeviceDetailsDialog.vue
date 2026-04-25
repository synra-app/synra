<script setup lang="ts">
import type { DisplayDevice } from '@synra/hooks'
import AppButton from '../base/AppButton.vue'

const props = defineProps<{
  visible: boolean
  device: DisplayDevice | null
  loading: boolean
  actionPending: boolean
  showPairedReconnect: boolean
}>()

const emit = defineEmits<{
  close: []
  unpair: [device: DisplayDevice]
  connectPaired: [device: DisplayDevice]
}>()

function formatTimestamp(value: number | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '-'
  }
  return new Date(value).toLocaleString()
}

function readOptionalField(device: DisplayDevice | null, field: 'direction' | 'platform'): string {
  if (!device) {
    return '-'
  }
  const value = (device as Record<string, unknown>)[field]
  if (typeof value !== 'string' || value.trim().length === 0) {
    return '-'
  }
  return value
}

function emitUnpair(): void {
  if (props.device) {
    emit('unpair', props.device)
  }
}

function emitConnectPaired(): void {
  if (props.device) {
    emit('connectPaired', props.device)
  }
}
</script>

<template>
  <div
    v-if="visible && device"
    class="fixed inset-0 z-[80] flex items-center justify-center bg-black/65 px-4 backdrop-blur-sm"
  >
    <div
      class="w-full max-w-lg rounded-2xl border border-white/14 bg-slate-950/92 p-5 shadow-2xl shadow-black/50"
    >
      <div class="flex items-center justify-between gap-2">
        <h3 class="text-lg font-semibold text-slate-100">{{ device.name }}</h3>
        <AppButton size="icon" @click="emit('close')">
          <span class="i-lucide-x text-sm" />
        </AppButton>
      </div>

      <div class="mt-4 space-y-3 text-sm">
        <div class="rounded-lg border border-white/10 bg-white/5 p-3">
          <p class="font-medium text-muted-1">Basic</p>
          <p class="mt-1 text-muted-2">IP: {{ device.ipAddress || '-' }}</p>
          <p class="text-muted-2">Port: {{ device.port ?? '-' }}</p>
        </div>

        <div class="rounded-lg border border-white/10 bg-white/5 p-3">
          <p class="font-medium text-muted-1">Identity</p>
          <p class="mt-1 text-muted-2">Device ID: {{ device.deviceId }}</p>
          <p class="text-muted-2">Source: {{ device.source }}</p>
          <p class="text-muted-2">Last Seen: {{ formatTimestamp(device.lastSeenAt) }}</p>
        </div>

        <div class="rounded-lg border border-white/10 bg-white/5 p-3">
          <p class="font-medium text-muted-1">Capability</p>
          <p class="mt-1 text-muted-2">Connectable: {{ device.connectable ? 'Yes' : 'No' }}</p>
          <p class="text-muted-2">Direction: {{ readOptionalField(device, 'direction') }}</p>
          <p class="text-muted-2">Platform: {{ readOptionalField(device, 'platform') }}</p>
        </div>
      </div>

      <div
        v-if="device.isPaired"
        class="mt-5 flex flex-wrap justify-end gap-2 border-t border-white/10 pt-4"
      >
        <AppButton
          v-if="showPairedReconnect"
          variant="solid"
          :disabled="loading || actionPending"
          @click="emitConnectPaired"
        >
          Connect
        </AppButton>
        <AppButton :disabled="loading || actionPending" @click="emitUnpair">Unpair</AppButton>
      </div>
    </div>
  </div>
</template>
