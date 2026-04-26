<script setup lang="ts">
import type { DisplayDevice } from '@synra/hooks'
import { ref } from 'vue'
import AppButton from '../base/AppButton.vue'
import DeviceDetailsDialog from './DeviceDetailsDialog.vue'

const props = defineProps<{
  devices: DisplayDevice[]
  loading: boolean
  actionPendingDeviceIds: string[]
  linkToneByDeviceId: Record<string, 'yellow' | 'green' | 'gray'>
  reconnectGaveUpByDeviceId: Record<string, boolean>
}>()

const emit = defineEmits<{
  pair: [device: DisplayDevice]
  unpair: [device: DisplayDevice]
  'manual-paired-reconnect': [device: DisplayDevice]
}>()

const selectedDevice = ref<DisplayDevice | null>(null)

function openDetails(device: DisplayDevice): void {
  selectedDevice.value = device
}

function closeDetails(): void {
  selectedDevice.value = null
}

function onPairFromRow(device: DisplayDevice): void {
  emit('pair', device)
}

function onUnpair(device: DisplayDevice): void {
  emit('unpair', device)
  closeDetails()
}

function onConnectPaired(device: DisplayDevice): void {
  emit('manual-paired-reconnect', device)
  closeDetails()
}

function dotClass(tone: 'yellow' | 'green' | 'gray' | undefined): string {
  if (tone === 'green') {
    return 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.7)]'
  }
  if (tone === 'yellow') {
    return 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.7)]'
  }
  return 'bg-slate-500 shadow-[0_0_5px_rgba(148,163,184,0.45)]'
}
</script>

<template>
  <PanelCard title="Devices">
    <ul v-if="devices.length > 0" class="space-y-2">
      <li
        v-for="device in devices"
        :key="device.deviceId"
        class="rounded-xl border border-white/12 bg-white/5 px-3 py-2.5"
      >
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex min-w-0 flex-1 items-center gap-2.5">
            <span
              class="h-2.5 w-2.5 shrink-0 rounded-full"
              :class="dotClass(linkToneByDeviceId[device.deviceId])"
              aria-hidden="true"
            />
            <div class="min-w-0">
              <p class="truncate text-sm font-semibold text-slate-100">
                {{ device.name }} · {{ device.ipAddress || '—'
                }}<span v-if="device.ipAddress && typeof device.port === 'number'"
                  >:{{ device.port }}</span
                >
              </p>
              <p v-if="device.isPaired" class="truncate text-xs text-slate-500">Paired</p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <AppButton
              :disabled="loading || actionPendingDeviceIds.includes(device.deviceId)"
              @click="openDetails(device)"
            >
              View
            </AppButton>
            <AppButton
              v-if="!device.isPaired"
              variant="solid"
              :disabled="
                loading || actionPendingDeviceIds.includes(device.deviceId) || !device.connectable
              "
              @click="onPairFromRow(device)"
            >
              Pair
            </AppButton>
          </div>
        </div>
      </li>
    </ul>
    <p v-else class="text-sm text-muted-3">
      {{ loading ? 'Scanning for devices...' : 'No paired or discovered devices yet.' }}
    </p>
  </PanelCard>

  <DeviceDetailsDialog
    :visible="selectedDevice !== null"
    :device="selectedDevice"
    :loading="loading"
    :action-pending="
      selectedDevice ? actionPendingDeviceIds.includes(selectedDevice.deviceId) : false
    "
    :show-paired-reconnect="
      selectedDevice ? Boolean(props.reconnectGaveUpByDeviceId[selectedDevice.deviceId]) : false
    "
    @close="closeDetails"
    @unpair="onUnpair"
    @connect-paired="onConnectPaired"
  />
</template>
