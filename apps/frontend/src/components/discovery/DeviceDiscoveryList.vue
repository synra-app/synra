<script setup lang="ts">
import type { DiscoveredDevice } from '@synra/capacitor-lan-discovery'
import AppButton from '../base/AppButton.vue'

defineProps<{
  devices: DiscoveredDevice[]
  loading: boolean
  connectedDeviceIds: string[]
}>()

const emit = defineEmits<{
  connect: [deviceId: string]
  disconnect: [deviceId: string]
  remove: [deviceId: string]
}>()
</script>

<template>
  <PanelCard title="Discovered Devices">
    <ul v-if="devices.length > 0" class="space-y-3">
      <li
        v-for="device in devices"
        :key="device.deviceId"
        class="rounded-xl border border-white/12 bg-white/5 p-3"
      >
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="space-y-1">
            <p class="font-semibold text-slate-100">{{ device.name }}</p>
            <p class="text-muted-2">
              {{ device.ipAddress
              }}<span v-if="typeof device.port === 'number'">:{{ device.port }}</span>
            </p>
            <p class="text-muted-4">
              Source: {{ device.source }} | Last Seen: {{ device.lastSeenAt }}
            </p>
          </div>
          <AppButton
            v-if="!connectedDeviceIds.includes(device.deviceId)"
            variant="solid"
            :disabled="loading"
            @click="emit('connect', device.deviceId)"
          >
            Connect
          </AppButton>
          <AppButton v-else :disabled="loading" @click="emit('disconnect', device.deviceId)">
            Disconnect
          </AppButton>
          <AppButton variant="danger" :disabled="loading" @click="emit('remove', device.deviceId)">
            Remove
          </AppButton>
        </div>
      </li>
    </ul>
    <p v-else class="text-muted-3">No connectable Synra devices found yet.</p>
  </PanelCard>
</template>
