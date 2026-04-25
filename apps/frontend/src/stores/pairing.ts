import { bumpPairedDevicesStorageEpoch } from '@synra/hooks'
import { defineStore } from 'pinia'
import { ref } from 'vue'
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

  function bumpPairedList(): void {
    pairedListEpoch.value += 1
    bumpPairedDevicesStorageEpoch()
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
    setIncoming,
    clearIncoming,
    clearIncomingIfRelated,
    hasOpenIncoming,
    bumpPairedList,
    pushFeedback
  }
})
