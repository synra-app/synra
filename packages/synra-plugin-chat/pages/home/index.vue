<script setup lang="ts">
import { ref } from 'vue'
import PanelCard from '../../components/layout/PanelCard.vue'
import DeviceDrawer from '../../components/session/DeviceDrawer.vue'
import DeviceSidebar from '../../components/session/DeviceSidebar.vue'
import MessageBubbleList from '../../components/session/MessageBubbleList.vue'
import MessageComposer from '../../components/session/MessageComposer.vue'
import { useMessagesPage } from '../../composables/useMessagesPage'

const drawerOpen = ref(false)

const {
  canSend,
  connectSelectedDevice,
  devices,
  disconnectSelectedDevice,
  error,
  loading,
  messages,
  messageInput,
  messageType,
  onSendMessage,
  reconnectSelectedDevice,
  refreshDeviceDiscovery,
  selectDevice,
  selectedDeviceLabel,
  selectedDeviceId,
  sending
} = useMessagesPage()

function onSelectDevice(deviceId: string): void {
  selectDevice(deviceId)
  drawerOpen.value = false
}
</script>

<template>
  <section
    class="synra-chat-app mx-auto w-full max-w-7xl space-y-4 px-3 py-4 sm:px-4 md:space-y-5 md:px-6"
  >
    <PanelCard class="lg:hidden">
      <div class="flex items-center justify-between gap-3">
        <div class="min-w-0">
          <p class="truncate text-sm font-semibold text-slate-100">{{ selectedDeviceLabel }}</p>
          <p class="truncate text-xs text-slate-400">Device selected for messaging</p>
        </div>
        <button class="glass-button app-focus-ring px-3 py-2 text-sm" @click="drawerOpen = true">
          Device Menu
        </button>
      </div>
    </PanelCard>

    <DeviceDrawer
      :open="drawerOpen"
      :devices="devices"
      :loading="loading"
      :selected-device-id="selectedDeviceId"
      :selected-device-label="selectedDeviceLabel"
      @close="drawerOpen = false"
      @select-device="onSelectDevice"
      @connect="connectSelectedDevice"
      @disconnect="disconnectSelectedDevice"
      @reconnect="reconnectSelectedDevice"
      @refresh="refreshDeviceDiscovery"
    />

    <div class="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6">
      <div class="hidden lg:col-span-4 lg:block">
        <PanelCard
          title="Devices"
          description="Choose a device and manage connectivity."
          class="h-full"
        >
          <DeviceSidebar
            :devices="devices"
            :loading="loading"
            :selected-device-id="selectedDeviceId"
            @select-device="onSelectDevice"
            @connect="connectSelectedDevice"
            @disconnect="disconnectSelectedDevice"
            @reconnect="reconnectSelectedDevice"
            @refresh="refreshDeviceDiscovery"
          />
        </PanelCard>
      </div>

      <div class="space-y-4 lg:col-span-8">
        <PanelCard title="Conversation">
          <p class="mb-3 text-xs text-slate-300">Sending to: {{ selectedDeviceLabel }}</p>

          <MessageBubbleList :messages="messages" :loading="loading" />
        </PanelCard>

        <MessageComposer
          v-model:message-input="messageInput"
          v-model:message-type="messageType"
          :disabled="!selectedDeviceId || loading"
          :can-send="canSend"
          :sending="sending"
          :error="error"
          @send="onSendMessage"
        />
      </div>
    </div>
  </section>
</template>
