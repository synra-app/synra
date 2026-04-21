<script setup lang="ts">
import type { DiscoveredDevice } from '@synra/capacitor-lan-discovery'
import { ref } from 'vue'
import AppButton from '../base/AppButton.vue'
import DeviceDetailsDialog from './DeviceDetailsDialog.vue'

defineProps<{
  devices: DiscoveredDevice[]
  loading: boolean
  connectedDeviceIds: string[]
  actionPendingDeviceIds: string[]
}>()

const emit = defineEmits<{
  connect: [deviceId: string]
  disconnect: [deviceId: string]
}>()

const selectedDevice = ref<DiscoveredDevice | null>(null)

function openDetails(device: DiscoveredDevice): void {
  selectedDevice.value = device
}

function closeDetails(): void {
  selectedDevice.value = null
}
</script>

<template>
  <PanelCard title="Discovered Devices">
    <ul v-if="devices.length > 0" class="space-y-2">
      <li
        v-for="device in devices"
        :key="device.deviceId"
        class="rounded-xl border border-white/12 bg-white/5 px-3 py-2.5"
      >
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="min-w-0">
            <p class="truncate text-sm font-semibold text-slate-100">
              {{ device.name }} · {{ device.ipAddress
              }}<span v-if="typeof device.port === 'number'">:{{ device.port }}</span>
            </p>
          </div>
          <div class="flex items-center gap-2">
            <AppButton
              :disabled="loading || actionPendingDeviceIds.includes(device.deviceId)"
              @click="openDetails(device)"
            >
              View
            </AppButton>
            <AppButton
              v-if="!connectedDeviceIds.includes(device.deviceId)"
              variant="solid"
              :disabled="loading || actionPendingDeviceIds.includes(device.deviceId)"
              @click="emit('connect', device.deviceId)"
            >
              Connect
            </AppButton>
            <AppButton
              v-else
              :disabled="loading || actionPendingDeviceIds.includes(device.deviceId)"
              @click="emit('disconnect', device.deviceId)"
            >
              Disconnect
            </AppButton>
          </div>
        </div>
      </li>
    </ul>
    <p v-else class="text-muted-3">No discovered Synra devices found yet.</p>
  </PanelCard>

  <DeviceDetailsDialog
    :visible="selectedDevice !== null"
    :device="selectedDevice"
    @close="closeDetails"
  />
</template>
