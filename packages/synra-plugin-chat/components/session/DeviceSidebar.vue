<script setup lang="ts">
import type { ChatDeviceListItem } from '../../src/types/chat'

defineProps<{
  devices: ChatDeviceListItem[]
  selectedDeviceId?: string
}>()

const emit = defineEmits<{
  selectDevice: [deviceId: string]
  refreshPaired: []
}>()

function statusLine(status: ChatDeviceListItem['linkStatus']): string {
  switch (status) {
    case 'connected':
      return '已连接'
    case 'connecting':
      return '连接中'
    case 'idle':
      return '在线'
    default:
      return '离线'
  }
}
</script>

<template>
  <!-- 结构与样式对齐 apps/frontend SidebarNav + ScrollContainer 内边距 -->
  <nav class="relative flex h-full min-h-0 flex-col gap-3 overflow-hidden">
    <div class="flex shrink-0 items-center justify-between px-0.5">
      <span class="text-xs text-muted-2">设备</span>
      <button
        type="button"
        class="app-focus-ring rounded-lg px-2 py-1 text-xs text-muted-2 transition hover:bg-white/7 hover:text-slate-200"
        @click="emit('refreshPaired')"
      >
        刷新
      </button>
    </div>

    <ul
      v-if="devices.length > 0"
      class="min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain pr-0.5"
    >
      <li v-for="device in devices" :key="device.deviceId">
        <button
          type="button"
          class="app-focus-ring flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left text-sm transition-all duration-200"
          :class="
            selectedDeviceId === device.deviceId
              ? 'border-primary-4/35 bg-primary/22 text-slate-100'
              : 'text-muted-2 hover:border-white/15 hover:bg-white/7'
          "
          @click="emit('selectDevice', device.deviceId)"
        >
          <span class="fcc h-5 w-5 shrink-0 text-base i-lucide-smartphone" aria-hidden="true" />
          <span class="min-w-0 flex-1">
            <span class="block truncate font-normal">{{ device.name }}</span>
            <span class="mt-0.5 block truncate text-xs text-muted-2 opacity-90">
              {{ statusLine(device.linkStatus) }}
              <span v-if="device.ipAddress" class="opacity-75"> · {{ device.ipAddress }}</span>
            </span>
          </span>
        </button>
      </li>
    </ul>

    <p v-else class="px-1 py-6 text-center text-xs leading-relaxed text-muted-2">
      暂无已配对设备，请先在主程序完成配对。
    </p>
  </nav>
</template>
