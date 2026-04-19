<script setup lang="ts">
import type { DiscoveredDevice } from '@synra/capacitor-lan-discovery'

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
        class="rounded-md border border-gray-200 p-3"
      >
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="space-y-1">
            <p class="font-semibold">{{ device.name }}</p>
            <p class="text-gray-600">{{ device.ipAddress }}</p>
            <p class="text-gray-500">
              Source: {{ device.source }} | Last Seen: {{ device.lastSeenAt }}
            </p>
            <p class="text-xs" :class="device.connectable ? 'text-green-700' : 'text-amber-700'">
              Connectable:
              {{
                device.connectable
                  ? 'yes'
                  : `no${device.connectCheckError ? ` (${device.connectCheckError})` : ''}`
              }}
            </p>
          </div>
          <button
            v-if="!connectedDeviceIds.includes(device.deviceId)"
            class="rounded-md bg-gray-900 px-3 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="loading || !device.connectable"
            @click="emit('connect', device.deviceId)"
          >
            Connect
          </button>
          <button
            v-else
            class="rounded-md border border-gray-300 px-3 py-2 disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="loading"
            @click="emit('disconnect', device.deviceId)"
          >
            Disconnect
          </button>
          <button
            class="rounded-md border border-red-300 px-3 py-2 text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="loading"
            @click="emit('remove', device.deviceId)"
          >
            Remove
          </button>
        </div>
      </li>
    </ul>
    <p v-else class="text-gray-600">No connectable Synra devices found yet.</p>
  </PanelCard>
</template>
