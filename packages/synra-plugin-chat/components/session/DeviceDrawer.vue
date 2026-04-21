<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue'
import DeviceSidebar from './DeviceSidebar.vue'
import type { ChatDevice } from '../../src/types/chat'

type KeydownLikeEvent = {
  key?: string
}

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

const props = defineProps<{
  open: boolean
  devices: ChatDevice[]
  loading: boolean
  selectedDeviceId?: string
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
    if (!browserWindow.document?.body) {
      return
    }
    browserWindow.document.body.style.overflow = isOpen ? 'hidden' : ''
  },
  { immediate: true }
)

onMounted(() => {
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
      class="fixed inset-x-0 bottom-0 top-14 z-[75] bg-black/60 backdrop-blur-sm lg:hidden"
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
      class="fixed bottom-0 left-0 top-14 z-[80] w-[86%] max-w-sm overflow-auto border-r border-white/14 bg-[#0f172af2] p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] text-slate-100 shadow-2xl backdrop-blur-xl lg:hidden"
    >
      <div class="mb-4 flex items-center justify-between border-b border-white/12 pb-3">
        <div>
          <p class="text-sm font-semibold text-slate-100">Device Menu</p>
          <p class="text-xs text-slate-400">{{ selectedDeviceLabel }}</p>
        </div>
        <button class="glass-button app-focus-ring px-3 py-1.5 text-xs" @click="emit('close')">
          Close
        </button>
      </div>

      <DeviceSidebar
        :devices="devices"
        :loading="loading"
        :selected-device-id="selectedDeviceId"
        @select-device="onSelectDevice"
        @connect="emit('connect')"
        @disconnect="emit('disconnect')"
        @reconnect="emit('reconnect')"
        @refresh="emit('refresh')"
      />
    </aside>
  </transition>
</template>
