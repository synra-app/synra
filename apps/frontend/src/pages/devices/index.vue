<script setup lang="ts">
const {
  activeConnections,
  connectableDevices,
  connectedDevice,
  connectedDeviceIds,
  error,
  isRemoveDialogOpen,
  loading,
  manualTarget,
  onCancelRemoveDevice,
  onConfirmRemoveDevice,
  reconnectTasks,
  removeDialogMessage,
  onConnect,
  onDisconnect,
  onDisconnectSession,
  onRemoveDevice,
  onRefreshDiscovery,
  onStartDiscovery,
  onStopDiscovery,
  openMessagePage,
  scanWindowMs,
  sessionState,
  socketPort,
  startedAt,
  statusLabel
} = useConnectPage()
</script>

<template>
  <section class="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6">
    <div class="space-y-4 lg:col-span-8">
      <PanelCard
        title="Device Network"
        description="Discover nearby devices and manage active connection sessions."
      >
        <div class="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
          <p><strong>Scan status:</strong> {{ statusLabel }}</p>
          <p><strong>Scan window:</strong> {{ scanWindowMs }} ms</p>
          <p><strong>Started at:</strong> {{ startedAt ?? '-' }}</p>
          <p><strong>Socket port:</strong> {{ socketPort }}</p>
          <p><strong>Session state:</strong> {{ sessionState.state }}</p>
          <p><strong>Session ID:</strong> {{ sessionState.sessionId ?? '-' }}</p>
        </div>
        <p>
          <strong>Connected device:</strong>
          {{ connectedDevice ? `${connectedDevice.name} (${connectedDevice.ipAddress})` : 'None' }}
        </p>
      </PanelCard>

      <DiscoveryToolbar
        v-model:manual-target="manualTarget"
        v-model:socket-port="socketPort"
        :loading="loading"
        :error="error"
        @start="onStartDiscovery"
        @stop="onStopDiscovery"
        @refresh="onRefreshDiscovery"
      />

      <DeviceDiscoveryList
        :devices="connectableDevices"
        :loading="loading"
        :connected-device-ids="connectedDeviceIds"
        @connect="onConnect"
        @disconnect="onDisconnect"
        @remove="onRemoveDevice"
      />

      <PanelCard title="Reconnect Queue">
        <ul v-if="reconnectTasks.length > 0" class="space-y-2 text-sm">
          <li
            v-for="task in reconnectTasks"
            :key="task.id"
            class="rounded-xl border border-white/12 bg-white/6 p-2.5 text-muted-2"
          >
            {{ task.deviceId }} · {{ task.host }}:{{ task.port }} · {{ task.status }} · attempts:
            {{ task.attempts }}
          </li>
        </ul>
        <p v-else class="text-sm text-muted-3">No reconnect tasks yet.</p>
      </PanelCard>
    </div>

    <div class="space-y-4 lg:col-span-4">
      <SessionList
        :sessions="activeConnections"
        mode="connect"
        @open-messages="openMessagePage"
        @disconnect="onDisconnectSession"
      />
      <PanelCard>
        <p class="text-sm text-muted-3">
          Open the built-in Chat plugin page to continue the active session.
        </p>
      </PanelCard>
    </div>
  </section>

  <ConfirmDialog
    :visible="isRemoveDialogOpen"
    title="Confirm Removal"
    :message="removeDialogMessage"
    confirm-text="Remove"
    cancel-text="Cancel"
    @confirm="onConfirmRemoveDevice"
    @cancel="onCancelRemoveDevice"
  />
</template>
