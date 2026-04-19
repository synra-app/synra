<script setup lang="ts">
import type { ChatDevice } from '../../src/types/chat'

defineProps<{
  devices: ChatDevice[]
  loading: boolean
  selectedDeviceId?: string
  selectedSessionId?: string
}>()

const emit = defineEmits<{
  selectDevice: [deviceId: string]
  connect: []
  reconnect: []
  disconnect: []
  refresh: []
}>()
</script>

<template>
  <div class="flex h-full flex-col">
    <header class="mb-3 flex items-center justify-between">
      <p class="text-xs font-semibold uppercase tracking-wide text-gray-500">Devices</p>
      <button
        class="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
        :disabled="loading"
        @click="emit('refresh')"
      >
        Refresh
      </button>
    </header>

    <ul v-if="devices.length > 0" class="flex-1 space-y-2 overflow-auto pr-1">
      <li
        v-for="device in devices"
        :key="device.deviceId"
        class="rounded-lg border p-3 transition"
        :class="
          selectedDeviceId === device.deviceId
            ? 'border-blue-300 bg-blue-50'
            : 'border-gray-200 bg-white hover:border-gray-300'
        "
      >
        <button class="w-full text-left" @click="emit('selectDevice', device.deviceId)">
          <p class="truncate text-sm font-semibold text-gray-900">{{ device.name }}</p>
          <p class="truncate text-xs text-gray-500">{{ device.ipAddress ?? 'No IP available' }}</p>
          <div class="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
            <span
              class="rounded-full px-2 py-0.5"
              :class="
                device.connectable
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-amber-100 text-amber-700'
              "
            >
              {{ device.connectable ? 'Connectable' : 'Unavailable' }}
            </span>
            <span
              v-if="device.sessionId"
              class="rounded-full px-2 py-0.5"
              :class="
                device.sessionStatus === 'open'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-600'
              "
            >
              {{ device.sessionStatus === 'open' ? 'Connected' : 'Closed' }}
            </span>
          </div>
          <p class="mt-1 text-[11px] text-gray-500">Seen {{ device.lastSeenLabel }}</p>
          <p v-if="device.connectCheckError" class="mt-1 text-[11px] text-amber-700">
            {{ device.connectCheckError }}
          </p>
        </button>
      </li>
    </ul>

    <p
      v-else
      class="rounded-md border border-dashed border-gray-300 px-3 py-6 text-center text-sm text-gray-500"
    >
      No devices discovered yet.
    </p>

    <footer class="mt-3 flex flex-wrap gap-2 border-t border-gray-100 pt-3">
      <button
        class="rounded-md bg-gray-900 px-3 py-2 text-sm text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="!selectedDeviceId || loading"
        @click="emit('connect')"
      >
        Connect
      </button>
      <button
        class="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="!selectedSessionId || loading"
        @click="emit('disconnect')"
      >
        Disconnect
      </button>
      <button
        class="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="!selectedDeviceId || loading"
        @click="emit('reconnect')"
      >
        Reconnect
      </button>
    </footer>
  </div>
</template>
