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
  <section
    class="synra-chat-app mx-auto w-full max-w-7xl space-y-4 px-3 py-4 sm:px-4 md:space-y-5 md:px-6"
  >
    <PanelCard class="lg:hidden">
      <div class="flex items-center justify-between gap-3">
        <div class="min-w-0">
          <p class="truncate text-sm font-semibold text-slate-100">{{ selectedDeviceLabel }}</p>
          <p class="truncate text-xs text-slate-400">
            Session: {{ selectedSessionId || 'Not connected' }}
          </p>
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
          <div
            class="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300"
          >
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
          <ul class="space-y-2 text-sm text-slate-200">
            <li
              v-for="session in activeSessions"
              :key="session.sessionId"
              class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/12 bg-white/6 px-3 py-2"
            >
              <div>
                <p class="font-medium text-slate-100">
                  {{ session.deviceId ?? session.sessionId }}
                </p>
                <p class="text-xs text-slate-400">
                  {{ session.remote ?? '-' }} | {{ session.lastActiveAt ?? '-' }}
                </p>
              </div>
              <button
                class="glass-button app-focus-ring px-2 py-1 text-xs"
                :class="
                  selectedSessionId === session.sessionId
                    ? 'border-indigo-300/55 bg-indigo-500/22 text-white'
                    : ''
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
