<script setup lang="ts">
import type { DiscoveredDevice } from "@synra/capacitor-lan-discovery";

const selectedDeviceId = defineModel<string>("selectedDeviceId", { required: true });

defineProps<{
  devices: DiscoveredDevice[];
  loading: boolean;
  canConnect: boolean;
  hasConnectedDevice: boolean;
}>();

const emit = defineEmits<{
  pair: [deviceId: string];
  connect: [];
  disconnect: [];
}>();
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
                  ? "yes"
                  : `no${device.connectCheckError ? ` (${device.connectCheckError})` : ""}`
              }}
            </p>
            <label class="inline-flex items-center gap-2 text-gray-700">
              <input
                v-model="selectedDeviceId"
                type="radio"
                name="selectedDevice"
                :value="device.deviceId"
              />
              Select for connection
            </label>
          </div>
          <button
            class="rounded-md border border-gray-300 px-3 py-2 disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="loading || device.paired"
            @click="emit('pair', device.deviceId)"
          >
            {{ device.paired ? "Paired" : "Pair" }}
          </button>
        </div>
      </li>
    </ul>
    <p v-else class="text-gray-600">No connectable Synra devices found yet.</p>
    <div class="flex flex-wrap gap-2 pt-1">
      <button
        class="rounded-md bg-gray-900 px-3 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="!canConnect"
        @click="emit('connect')"
      >
        Connect Selected
      </button>
      <button
        class="rounded-md border border-gray-300 px-3 py-2 disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="!hasConnectedDevice"
        @click="emit('disconnect')"
      >
        Disconnect
      </button>
    </div>
  </PanelCard>
</template>
