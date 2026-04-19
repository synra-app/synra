<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue'
import DeviceSidebar from './DeviceSidebar.vue'
import type { ChatDevice } from '../../src/types/chat'

type KeydownLikeEvent = {
  key?: string
}

const DEBUG_PREFIX = '[synra-plugin-chat/DeviceDrawer]'
const browserWindow = globalThis as {
  addEventListener?: (type: string, listener: (event: KeydownLikeEvent) => void) => void
  removeEventListener?: (type: string, listener: (event: KeydownLikeEvent) => void) => void
  document?: {
    body?: {
      style: {
        overflow: string
      }
    }
  }
}

console.info(`${DEBUG_PREFIX} module loaded`, {
  hasDeviceSidebar: Boolean(DeviceSidebar),
  deviceSidebarName: (DeviceSidebar as { name?: string } | undefined)?.name ?? null
})

const props = defineProps<{
  open: boolean
  devices: ChatDevice[]
  loading: boolean
  selectedDeviceId?: string
  selectedSessionId?: string
  selectedDeviceLabel: string
}>()

const emit = defineEmits<{
  close: []
  selectDevice: [deviceId: string]
  connect: []
  reconnect: []
  disconnect: []
  refresh: []
}>()

function onSelectDevice(deviceId: string): void {
  emit('selectDevice', deviceId)
  emit('close')
}

function onWindowKeydown(event: KeydownLikeEvent): void {
  if (event.key === 'Escape' && props.open) {
    emit('close')
  }
}

watch(
  () => props.open,
  (isOpen) => {
    console.info(`${DEBUG_PREFIX} props.open changed`, {
      isOpen,
      devices: props.devices.length,
      selectedDeviceId: props.selectedDeviceId ?? null,
      selectedSessionId: props.selectedSessionId ?? null
    })
    if (!browserWindow.document?.body) {
      return
    }
    browserWindow.document.body.style.overflow = isOpen ? 'hidden' : ''
  },
  { immediate: true }
)

onMounted(() => {
  console.info(`${DEBUG_PREFIX} mounted`, {
    hasWindow: Boolean(browserWindow.addEventListener),
    hasDocument: Boolean(browserWindow.document)
  })
  if (!browserWindow.addEventListener) {
    return
  }
  browserWindow.addEventListener('keydown', onWindowKeydown)
})

onUnmounted(() => {
  if (browserWindow.removeEventListener) {
    browserWindow.removeEventListener('keydown', onWindowKeydown)
  }
  if (browserWindow.document?.body) {
    browserWindow.document.body.style.overflow = ''
  }
})
</script>

<template>
  <transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-active-class="transition duration-150 ease-in"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <div
      v-if="open"
      class="fixed inset-0 z-40 bg-black/40 lg:hidden"
      role="button"
      tabindex="0"
      aria-label="Close device menu"
      @click="emit('close')"
      @keydown.enter.prevent="emit('close')"
    />
  </transition>

  <transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="-translate-x-full"
    enter-to-class="translate-x-0"
    leave-active-class="transition duration-150 ease-in"
    leave-from-class="translate-x-0"
    leave-to-class="-translate-x-full"
  >
    <aside
      v-if="open"
      class="fixed inset-y-0 left-0 z-50 w-[86%] max-w-sm overflow-auto border-r border-gray-200 bg-white p-4 shadow-lg lg:hidden"
    >
      <div class="mb-4 flex items-center justify-between border-b border-gray-100 pb-3">
        <div>
          <p class="text-sm font-semibold text-gray-900">Device Menu</p>
          <p class="text-xs text-gray-500">{{ selectedDeviceLabel }}</p>
        </div>
        <button
          class="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 transition hover:bg-gray-50"
          @click="emit('close')"
        >
          Close
        </button>
      </div>

      <DeviceSidebar
        :devices="devices"
        :loading="loading"
        :selected-device-id="selectedDeviceId"
        :selected-session-id="selectedSessionId"
        @select-device="onSelectDevice"
        @connect="emit('connect')"
        @disconnect="emit('disconnect')"
        @reconnect="emit('reconnect')"
        @refresh="emit('refresh')"
      />
    </aside>
  </transition>
</template>
