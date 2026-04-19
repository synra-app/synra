<script setup lang="ts">
const {
  activeConnections,
  canConnect,
  connectableDevices,
  connectedDevice,
  error,
  loading,
  manualTarget,
  onConnect,
  onDisconnect,
  onPairDevice,
  onRefreshDiscovery,
  onStartDiscovery,
  onStopDiscovery,
  openMessagePage,
  scanWindowMs,
  selectedDeviceId,
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
        description="Discover nearby devices and manage pairing sessions."
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
        v-model:selected-device-id="selectedDeviceId"
        :devices="connectableDevices"
        :loading="loading"
        :can-connect="canConnect"
        :has-connected-device="Boolean(connectedDevice)"
        @pair="onPairDevice"
        @connect="onConnect"
        @disconnect="onDisconnect"
      />
    </div>

    <div class="space-y-4 lg:col-span-4">
      <SessionList :sessions="activeConnections" mode="connect" @open-messages="openMessagePage" />
      <PanelCard>
        <p class="text-sm text-muted-5">
          Open the built-in Chat plugin page to continue the active session.
        </p>
      </PanelCard>
    </div>
  </section>
</template>
