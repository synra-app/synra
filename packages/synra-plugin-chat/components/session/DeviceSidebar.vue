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
      <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Devices</p>
      <button
        class="glass-button app-focus-ring px-3 py-1.5 text-xs"
        :disabled="loading"
        @click="emit('refresh')"
      >
        Refresh
      </button>
    </header>

    <ul v-if="devices.length > 0" class="app-scroll-container flex-1 space-y-2 overflow-auto pr-1">
      <li
        v-for="device in devices"
        :key="device.deviceId"
        class="rounded-xl border p-3 transition duration-200"
        :class="
          selectedDeviceId === device.deviceId
            ? 'border-indigo-300/55 bg-indigo-500/20 shadow-[0_8px_24px_rgba(79,70,229,0.22)]'
            : 'border-white/12 bg-white/6 hover:border-white/24 hover:bg-white/10'
        "
      >
        <button
          class="app-focus-ring w-full text-left rounded-lg p-1"
          @click="emit('selectDevice', device.deviceId)"
        >
          <p class="truncate text-sm font-semibold text-slate-100">{{ device.name }}</p>
          <p class="truncate text-xs text-slate-400">{{ device.ipAddress ?? 'No IP available' }}</p>
          <div class="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
            <span
              class="rounded-full px-2 py-0.5 font-medium"
              :class="
                device.connectable
                  ? 'bg-emerald-400/20 text-emerald-200'
                  : 'bg-amber-400/18 text-amber-200'
              "
            >
              {{ device.connectable ? 'Connectable' : 'Unavailable' }}
            </span>
            <span
              v-if="device.sessionId"
              class="rounded-full px-2 py-0.5 font-medium"
              :class="
                device.sessionStatus === 'open'
                  ? 'bg-sky-400/20 text-sky-200'
                  : 'bg-slate-400/18 text-slate-300'
              "
            >
              {{ device.sessionStatus === 'open' ? 'Connected' : 'Closed' }}
            </span>
          </div>
          <p class="mt-1 text-[11px] text-slate-400">Seen {{ device.lastSeenLabel }}</p>
          <p v-if="device.connectCheckError" class="mt-1 text-[11px] text-amber-200">
            {{ device.connectCheckError }}
          </p>
        </button>
      </li>
    </ul>

    <p
      v-else
      class="rounded-xl border border-dashed border-white/22 bg-white/4 px-3 py-6 text-center text-sm text-slate-300"
    >
      No devices discovered yet.
    </p>

    <footer class="mt-3 flex flex-wrap gap-2 border-t border-white/12 pt-3">
      <button
        class="app-focus-ring rounded-lg bg-indigo-500/90 px-3 py-2 text-sm text-white transition-all duration-200 hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="!selectedDeviceId || loading"
        @click="emit('connect')"
      >
        Connect
      </button>
      <button
        class="glass-button app-focus-ring px-3 py-2 text-sm"
        :disabled="!selectedSessionId || loading"
        @click="emit('disconnect')"
      >
        Disconnect
      </button>
      <button
        class="glass-button app-focus-ring px-3 py-2 text-sm"
        :disabled="!selectedDeviceId || loading"
        @click="emit('reconnect')"
      >
        Reconnect
      </button>
    </footer>
  </div>
</template>

<style scoped>
.app-scroll-container::-webkit-scrollbar {
  width: 0;
}

.app-scroll-container:hover::-webkit-scrollbar {
  width: 8px;
}

.app-scroll-container::-webkit-scrollbar-track {
  background: transparent;
}

.app-scroll-container::-webkit-scrollbar-thumb {
  border-radius: 9999px;
  background: rgba(148, 163, 184, 0.52);
}
</style>
