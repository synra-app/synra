import { bumpPairedDevicesStorageEpoch } from '@synra/hooks'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { syncPairedDiscoveryExclusionFromRecords } from '../lib/discovery-paired-exclusion'
import {
  listPairedDeviceRecords,
  type SynraPairedDeviceRecord
} from '../lib/paired-devices-storage'
import type { PairInitiatorProfile } from '../lib/pair-protocol'

export type PairingIncoming = {
  requestId: string
  from: string
  target: string
  initiator: PairInitiatorProfile
}

export const usePairingStore = defineStore('pairing', () => {
  const incoming = ref<PairingIncoming | null>(null)
  const feedbackMessage = ref<string | null>(null)
  const pairedListEpoch = ref(0)
  const pairedRecords = ref<SynraPairedDeviceRecord[]>([])
  const pairedRecordsReady = ref(false)
  let refreshInFlight: Promise<ReadonlyArray<SynraPairedDeviceRecord>> | null = null

  function setIncoming(payload: PairingIncoming): void {
    incoming.value = payload
  }

  function clearIncoming(): void {
    incoming.value = null
  }

  function hasOpenIncoming(): boolean {
    return incoming.value !== null
  }

  /** Drop pending incoming UI if it involves this device (e.g. after local unpair). */
  function clearIncomingIfRelated(deviceId: string): void {
    const cur = incoming.value
    if (!cur) {
      return
    }
    if (cur.initiator.deviceId === deviceId || cur.from === deviceId || cur.target === deviceId) {
      incoming.value = null
    }
  }

  function setPairedRecords(records: ReadonlyArray<SynraPairedDeviceRecord>): void {
    pairedRecords.value = [...records]
    pairedRecordsReady.value = true
    syncPairedDiscoveryExclusionFromRecords(pairedRecords.value)
  }

  async function refreshPairedRecords(): Promise<ReadonlyArray<SynraPairedDeviceRecord>> {
    if (refreshInFlight) {
      return refreshInFlight
    }
    refreshInFlight = (async () => {
      try {
        // SYNRA-COMM::PLUGIN_BRIDGE::CONNECT::LOAD_PAIRED_RECORDS
        const records = await listPairedDeviceRecords()
        setPairedRecords(records)
        return records
      } catch {
        // Keep current rows on transient read failures to avoid UI flicker/regression.
        pairedRecordsReady.value = true
        syncPairedDiscoveryExclusionFromRecords(pairedRecords.value)
        return pairedRecords.value
      } finally {
        refreshInFlight = null
      }
    })()
    return refreshInFlight
  }

  function hasPairedDevice(deviceId: string): boolean {
    return pairedRecords.value.some((row) => row.deviceId === deviceId)
  }

  async function hasPairedDeviceStrict(deviceId: string): Promise<boolean> {
    if (hasPairedDevice(deviceId)) {
      return true
    }
    const latest = await refreshPairedRecords()
    return latest.some((row) => row.deviceId === deviceId)
  }

  function bumpPairedList(): void {
    pairedListEpoch.value += 1
    bumpPairedDevicesStorageEpoch()
    void refreshPairedRecords()
  }

  function pushFeedback(text: string): void {
    feedbackMessage.value = text
    window.setTimeout(() => {
      if (feedbackMessage.value === text) {
        feedbackMessage.value = null
      }
    }, 5000)
  }

  return {
    incoming,
    feedbackMessage,
    pairedListEpoch,
    pairedRecords,
    pairedRecordsReady,
    setIncoming,
    clearIncoming,
    clearIncomingIfRelated,
    hasOpenIncoming,
    setPairedRecords,
    refreshPairedRecords,
    hasPairedDevice,
    hasPairedDeviceStrict,
    bumpPairedList,
    pushFeedback
  }
})
