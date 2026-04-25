<script setup lang="ts">
import type { DisplayDevice } from '@synra/hooks'

const {
  displayDevices,
  error,
  feedbackMessage,
  linkToneByDeviceId,
  loading,
  onManualPairedReconnect,
  onPairDevice,
  onScanDiscovery,
  onUnpairDevice,
  pendingDeviceActionIds,
  reconnectGaveUpByDeviceId
} = useConnectPage()

function onManualPairedReconnectFromList(device: DisplayDevice): void {
  void onManualPairedReconnect(device.deviceId)
}
</script>

<template>
  <section class="space-y-4">
    <div class="flex items-center justify-end">
      <AppButton size="icon" :disabled="loading" @click="onScanDiscovery">
        <span :class="['i-lucide-refresh-cw text-sm', loading ? 'animate-spin' : '']" />
      </AppButton>
    </div>

    <p v-if="feedbackMessage" class="text-sm text-amber-300">{{ feedbackMessage }}</p>

    <DeviceDiscoveryList
      :devices="displayDevices"
      :loading="loading"
      :action-pending-device-ids="pendingDeviceActionIds"
      :link-tone-by-device-id="linkToneByDeviceId"
      :reconnect-gave-up-by-device-id="reconnectGaveUpByDeviceId"
      @pair="onPairDevice"
      @unpair="onUnpairDevice"
      @manual-paired-reconnect="onManualPairedReconnectFromList"
    />

    <p v-if="error" class="text-sm text-error-4">{{ error }}</p>
  </section>
</template>
