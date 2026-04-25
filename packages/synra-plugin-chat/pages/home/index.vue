<script setup lang="ts">
import { computed, ref } from 'vue'
import DeviceDrawer from '../../components/session/DeviceDrawer.vue'
import DeviceSidebar from '../../components/session/DeviceSidebar.vue'
import MessageBubbleList from '../../components/session/MessageBubbleList.vue'
import MessageComposer from '../../components/session/MessageComposer.vue'
import { useMessagesPage } from '../../composables/useMessagesPage'

const drawerOpen = ref(false)

const {
  canSend,
  devices,
  messageInput,
  messages,
  onSendMessage,
  refreshPairedList,
  selectDevice,
  selectedDeviceLabel,
  selectedDeviceId,
  selectedStatusLong,
  selectedStatusShort,
  sendError,
  sending
} = useMessagesPage()

function onSelectDevice(deviceId: string): void {
  selectDevice(deviceId)
  drawerOpen.value = false
}

const composerDisabled = computed(() => !selectedDeviceId)
</script>

<template>
  <!-- 移动端单列；桌面端强制两列：160px + 自适应 -->
  <section
    class="synra-chat-app grid min-h-0 min-w-0 w-full max-w-full flex-1 grid-cols-1 gap-0 grid-rows-[auto_minmax(0,1fr)]"
  >
    <div
      class="col-span-1 row-start-1 flex shrink-0 items-center justify-between border-b border-white/10 px-3 py-2.5 lg:hidden"
    >
      <div class="min-w-0">
        <p class="truncate text-sm text-slate-100">{{ selectedDeviceLabel }}</p>
        <p class="truncate text-xs text-muted-2">
          {{ selectedStatusShort }}
        </p>
      </div>
      <button
        type="button"
        class="app-focus-ring shrink-0 rounded-xl border border-transparent px-3 py-2 text-xs text-muted-2 transition hover:border-white/15 hover:bg-white/7"
        @click="drawerOpen = true"
      >
        设备
      </button>
    </div>

    <DeviceDrawer
      :open="drawerOpen"
      :devices="devices"
      :selected-device-id="selectedDeviceId"
      :selected-device-label="selectedDeviceLabel"
      @close="drawerOpen = false"
      @select-device="onSelectDevice"
      @refresh-paired="refreshPairedList"
    />

    <aside
      class="synra-chat-sidebar col-span-1 row-start-1 hidden min-h-0 min-w-0 self-stretch overflow-x-hidden lg:block"
    >
      <div class="flex h-full min-h-0 min-w-0 w-full flex-col rounded-2xl bg-white/4 p-2">
        <DeviceSidebar
          :devices="devices"
          :selected-device-id="selectedDeviceId"
          @select-device="onSelectDevice"
          @refresh-paired="refreshPairedList"
        />
      </div>
    </aside>

    <div
      class="synra-chat-main col-span-1 row-start-2 flex min-h-0 min-w-0 w-full max-w-full flex-col self-stretch overflow-hidden lg:h-full lg:rounded-2xl lg:glass-panel"
    >
      <header class="hidden shrink-0 border-b border-white/10 px-4 py-2.5 md:px-5 lg:block">
        <p class="truncate text-sm text-slate-100">{{ selectedDeviceLabel }}</p>
        <p class="text-xs text-muted-2">
          {{ selectedStatusLong }}
        </p>
      </header>

      <MessageBubbleList
        class="min-h-0 flex-1 px-3 py-2 md:px-4 md:py-3"
        :messages="messages"
        :loading="false"
      />

      <div class="shrink-0 border-t border-white/10 px-3 py-2 md:px-4 md:py-3">
        <MessageComposer
          v-model:message-input="messageInput"
          :disabled="composerDisabled"
          :can-send="canSend"
          :sending="sending"
          :error="sendError"
          @send="onSendMessage"
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
@media (min-width: 1024px) {
  .synra-chat-app {
    display: grid;
    grid-template-columns: 260px minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
    gap: 0.75rem;
  }

  .synra-chat-sidebar {
    display: block;
    grid-column: 1;
    grid-row: 1;
  }

  .synra-chat-main {
    grid-column: 2;
    grid-row: 1;
    min-width: 0;
  }
}
</style>
