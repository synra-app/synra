<script setup lang="ts">
const {
  connectableDevices,
  connectedDeviceIds,
  error,
  loading,
  onConnect,
  onDisconnect,
  onScanDiscovery,
  pendingDeviceActionIds
} = useConnectPage()
</script>

<template>
  <section class="space-y-4">
    <div class="flex items-center justify-end">
      <AppButton size="icon" :disabled="loading" @click="onScanDiscovery">
        <span :class="['i-lucide-refresh-cw text-sm', loading ? 'animate-spin' : '']" />
      </AppButton>
    </div>

    <DeviceDiscoveryList
      :devices="connectableDevices"
      :loading="loading"
      :connected-device-ids="connectedDeviceIds"
      :action-pending-device-ids="pendingDeviceActionIds"
      @connect="onConnect"
      @disconnect="onDisconnect"
    />

    <p v-if="error" class="text-sm text-error-4">{{ error }}</p>
  </section>
</template>
