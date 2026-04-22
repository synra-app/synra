<script setup lang="ts">
const {
  displayDevices,
  connectedDeviceIds,
  error,
  feedbackMessage,
  linkToneByDeviceId,
  loading,
  onPairDevice,
  onScanDiscovery,
  onUnpairDevice,
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

    <p v-if="feedbackMessage" class="text-sm text-amber-300">{{ feedbackMessage }}</p>

    <DeviceDiscoveryList
      :devices="displayDevices"
      :loading="loading"
      :connected-device-ids="connectedDeviceIds"
      :action-pending-device-ids="pendingDeviceActionIds"
      :link-tone-by-device-id="linkToneByDeviceId"
      @pair="onPairDevice"
      @unpair="onUnpairDevice"
    />

    <p v-if="error" class="text-sm text-error-4">{{ error }}</p>
  </section>
</template>
