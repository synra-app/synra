<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue'
import DeviceSidebar from './DeviceSidebar.vue'
import type { ChatDeviceListItem } from '../../src/types/chat'

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
  devices: ChatDeviceListItem[]
  selectedDeviceId?: string
  selectedDeviceLabel: string
}>()

const emit = defineEmits<{
  close: []
  selectDevice: [deviceId: string]
  refreshPaired: []
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
  if (!browserWindow.removeEventListener) {
    return
  }
  browserWindow.removeEventListener('keydown', onWindowKeydown)
  if (browserWindow.document?.body) {
    browserWindow.document.body.style.overflow = ''
  }
})
</script>

<template>
  <!-- Teleport：避免多根节点插在 chat 的 grid 里占位，导致桌面设备列被挤到消息下方 -->
  <Teleport to="body">
    <div class="pointer-events-none lg:hidden">
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
          class="pointer-events-auto fixed inset-0 z-[75] bg-black/55"
          role="button"
          tabindex="0"
          aria-label="关闭"
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
          class="pointer-events-auto fixed inset-y-0 left-0 z-[80] flex w-[min(280px,86vw)] flex-col border-r border-white/10 bg-[#0f172af2] shadow-2xl backdrop-blur-xl"
        >
          <div
            class="flex shrink-0 items-center justify-between border-b border-white/10 px-3 pb-3 pt-4"
          >
            <p class="truncate text-sm font-medium text-slate-100">{{ selectedDeviceLabel }}</p>
            <button
              type="button"
              class="app-focus-ring rounded-lg px-2 py-1 text-xs text-muted-2 hover:bg-white/7 hover:text-slate-200"
              @click="emit('close')"
            >
              完成
            </button>
          </div>
          <div class="min-h-0 flex-1 overflow-hidden p-3 pt-2">
            <DeviceSidebar
              :devices="devices"
              :selected-device-id="selectedDeviceId"
              @select-device="onSelectDevice"
              @refresh-paired="emit('refreshPaired')"
            />
          </div>
        </aside>
      </transition>
    </div>
  </Teleport>
</template>
