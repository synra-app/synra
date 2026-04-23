<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { ref } from 'vue'
import { setPairAwaitingAccept } from '@synra/hooks'
import { upsertPairedDeviceRecord } from '../../lib/paired-devices-storage'
import { useLanDiscoveryStore } from '../../stores/lan-discovery'
import { usePairingStore } from '../../stores/pairing'
import AppButton from '../base/AppButton.vue'

function isIpv4Address(value: string | undefined): boolean {
  if (typeof value !== 'string') {
    return false
  }
  const segments = value.trim().split('.')
  if (segments.length !== 4) {
    return false
  }
  return segments.every(
    (segment) => /^\d{1,3}$/.test(segment) && Number(segment) >= 0 && Number(segment) <= 255
  )
}

const pairingStore = usePairingStore()
const lanStore = useLanDiscoveryStore()
const { incoming } = storeToRefs(pairingStore)

const busy = ref(false)

async function onAccept(): Promise<void> {
  const current = incoming.value
  if (!current || busy.value) {
    return
  }
  busy.value = true
  try {
    const host = current.initiator.ipAddress?.trim() ?? ''
    const recordBase = {
      deviceId: current.initiator.deviceId,
      displayName: current.initiator.name,
      pairedAt: Date.now()
    }
    await upsertPairedDeviceRecord(
      isIpv4Address(host)
        ? {
            ...recordBase,
            lastResolvedHost: host,
            lastResolvedPort: current.initiator.port ?? 32100
          }
        : recordBase
    )
    await lanStore.sendLanEvent({
      sessionId: current.sessionId,
      eventName: 'pairing.response',
      payload: { requestId: current.requestId, accepted: true }
    })
    setPairAwaitingAccept(current.initiator.deviceId, false)
    pairingStore.bumpPairedList()
    pairingStore.clearIncoming()
  } finally {
    busy.value = false
  }
}

async function onReject(): Promise<void> {
  const current = incoming.value
  if (!current || busy.value) {
    return
  }
  busy.value = true
  try {
    await lanStore.sendLanEvent({
      sessionId: current.sessionId,
      eventName: 'pairing.response',
      payload: { requestId: current.requestId, accepted: false, reason: 'Declined' }
    })
  } catch {
    // Session may already be half-closed; still tear down UI and TCP below.
  } finally {
    setPairAwaitingAccept(current.initiator.deviceId, false)
    pairingStore.clearIncoming()
    void lanStore.disconnectDevice(current.initiator.deviceId).catch(() => undefined)
    busy.value = false
  }
}
</script>

<template>
  <div
    v-if="incoming"
    class="fixed inset-0 z-[90] flex items-center justify-center bg-black/65 px-4 backdrop-blur-sm"
  >
    <div
      class="w-full max-w-lg rounded-2xl border border-white/14 bg-slate-950/92 p-5 shadow-2xl shadow-black/50"
    >
      <h3 class="text-lg font-semibold text-slate-100">Pairing request</h3>
      <p class="mt-2 text-sm text-muted-2">
        Another device wants to pair with you. Review its details before accepting.
      </p>

      <div class="mt-4 space-y-3 text-sm">
        <div class="rounded-lg border border-white/10 bg-white/5 p-3">
          <p class="font-medium text-muted-1">Device</p>
          <p class="mt-1 text-muted-2">Name: {{ incoming.initiator.name }}</p>
          <p class="text-muted-2">ID: {{ incoming.initiator.deviceId }}</p>
        </div>
        <div class="rounded-lg border border-white/10 bg-white/5 p-3">
          <p class="font-medium text-muted-1">Network</p>
          <p class="mt-1 text-muted-2">IP: {{ incoming.initiator.ipAddress || '-' }}</p>
          <p class="text-muted-2">Port: {{ incoming.initiator.port ?? '-' }}</p>
        </div>
        <div class="rounded-lg border border-white/10 bg-white/5 p-3">
          <p class="font-medium text-muted-1">Meta</p>
          <p class="mt-1 text-muted-2">Platform: {{ incoming.initiator.platform ?? '-' }}</p>
          <p class="text-muted-2">Source: {{ incoming.initiator.source ?? '-' }}</p>
          <p class="text-muted-2">
            Connectable: {{ incoming.initiator.connectable ? 'Yes' : 'No' }}
          </p>
        </div>
      </div>

      <div class="mt-5 flex flex-wrap justify-end gap-2">
        <AppButton :disabled="busy" @click="onReject">Decline</AppButton>
        <AppButton variant="solid" :disabled="busy" @click="onAccept">Accept</AppButton>
      </div>
    </div>
  </div>
</template>
