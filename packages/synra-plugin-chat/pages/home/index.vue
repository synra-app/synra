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
  activeSessions,
  canSend,
  connectSelectedDevice,
  devices,
  disconnectSelectedSession,
  error,
  loading,
  messages,
  messageInput,
  messageType,
  onSendMessage,
  openSession,
  reconnectSelectedDevice,
  refreshDeviceDiscovery,
  selectDevice,
  selectedDeviceLabel,
  selectedDeviceId,
  selectedSession,
  selectedSessionId,
  sending
} = useMessagesPage()

function onSelectDevice(deviceId: string): void {
  selectDevice(deviceId)
  drawerOpen.value = false
}
</script>

<template>
  <section class="synra-chat-app space-y-4">
    <PanelCard class="lg:hidden">
      <div class="flex items-center justify-between gap-3">
        <div class="min-w-0">
          <p class="truncate text-sm font-semibold text-gray-900">{{ selectedDeviceLabel }}</p>
          <p class="truncate text-xs text-gray-500">
            Session: {{ selectedSessionId || 'Not connected' }}
          </p>
        </div>
        <button
          class="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-50"
          @click="drawerOpen = true"
        >
          Device Menu
        </button>
      </div>
    </PanelCard>

    <DeviceDrawer
      :open="drawerOpen"
      :devices="devices"
      :loading="loading"
      :selected-device-id="selectedDeviceId"
      :selected-session-id="selectedSessionId"
      :selected-device-label="selectedDeviceLabel"
      @close="drawerOpen = false"
      @select-device="onSelectDevice"
      @connect="connectSelectedDevice"
      @disconnect="disconnectSelectedSession"
      @reconnect="reconnectSelectedDevice"
      @refresh="refreshDeviceDiscovery"
    />

    <div class="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6">
      <div class="hidden lg:col-span-4 lg:block">
        <PanelCard
          title="Devices"
          description="Choose a device and manage session state."
          class="h-full"
        >
          <DeviceSidebar
            :devices="devices"
            :loading="loading"
            :selected-device-id="selectedDeviceId"
            :selected-session-id="selectedSessionId"
            @select-device="onSelectDevice"
            @connect="connectSelectedDevice"
            @disconnect="disconnectSelectedSession"
            @reconnect="reconnectSelectedDevice"
            @refresh="refreshDeviceDiscovery"
          />
        </PanelCard>
      </div>

      <div class="space-y-4 lg:col-span-8">
        <PanelCard title="Conversation">
          <div class="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
            <p><strong>Session:</strong> {{ selectedSessionId || '-' }}</p>
            <p><strong>Status:</strong> {{ selectedSession?.status ?? 'idle' }}</p>
            <p><strong>Remote:</strong> {{ selectedSession?.remote ?? '-' }}</p>
            <p><strong>Direction:</strong> {{ selectedSession?.direction ?? '-' }}</p>
          </div>

          <MessageBubbleList :messages="messages" :loading="loading" />
        </PanelCard>

        <MessageComposer
          v-model:message-input="messageInput"
          v-model:message-type="messageType"
          :disabled="!selectedSession || loading"
          :can-send="canSend"
          :sending="sending"
          :error="error"
          @send="onSendMessage"
        />

        <PanelCard v-if="activeSessions.length > 0" title="Open Sessions">
          <ul class="space-y-2 text-sm text-gray-700">
            <li
              v-for="session in activeSessions"
              :key="session.sessionId"
              class="flex flex-wrap items-center justify-between gap-2 rounded-md border border-gray-200 px-3 py-2"
            >
              <div>
                <p class="font-medium">{{ session.deviceId ?? session.sessionId }}</p>
                <p class="text-xs text-gray-500">
                  {{ session.remote ?? '-' }} | {{ session.lastActiveAt ?? '-' }}
                </p>
              </div>
              <button
                class="rounded-md border border-gray-300 px-2 py-1 text-xs transition hover:bg-gray-50"
                :class="
                  selectedSessionId === session.sessionId ? 'border-blue-400 text-blue-700' : ''
                "
                @click="openSession(session.sessionId)"
              >
                {{ selectedSessionId === session.sessionId ? 'Current' : 'Switch' }}
              </button>
            </li>
          </ul>
        </PanelCard>
      </div>
    </div>
  </section>
</template>
