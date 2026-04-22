<script setup lang="ts">
import AppButton from '../../components/base/AppButton.vue'
import {
  createEmptyPairedDevicesPayload,
  savePairedDevicesPayload
} from '../../lib/paired-devices-storage'
import { usePairingStore } from '../../stores/pairing'

type ActionStatus = 'idle' | 'success' | 'error'

const pairingStore = usePairingStore()
const actionStatus = ref<ActionStatus>('idle')
const actionMessage = ref('')
const isClearing = ref(false)

async function clearPairedDevicesList(): Promise<void> {
  if (isClearing.value) {
    return
  }

  isClearing.value = true
  actionStatus.value = 'idle'
  actionMessage.value = ''
  try {
    await savePairedDevicesPayload(createEmptyPairedDevicesPayload())
    pairingStore.bumpPairedList()
    actionStatus.value = 'success'
    actionMessage.value = 'Cleared paired devices list.'
  } catch (error: unknown) {
    actionStatus.value = 'error'
    actionMessage.value =
      error instanceof Error ? error.message : 'Failed to clear paired devices list.'
  } finally {
    isClearing.value = false
  }
}
</script>

<template>
  <PanelCard
    title="Development"
    description="Runtime maintenance actions used for local debugging and testing."
  >
    <div class="flex flex-wrap gap-2">
      <AppButton variant="solid" :disabled="isClearing" @click="clearPairedDevicesList">
        Clear paired devices list
      </AppButton>
    </div>
    <p
      v-if="actionMessage"
      class="text-sm"
      :class="actionStatus === 'error' ? 'text-error-4' : 'text-success-4'"
    >
      {{ actionMessage }}
    </p>
  </PanelCard>
</template>
