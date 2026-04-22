import {
  getPairAwaitingAcceptDeviceIds,
  getPairedLinkPhases,
  mergePairedAndDiscoveredDevices,
  setPairAwaitingAccept,
  type DisplayDevice
} from '@synra/hooks'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import type { DiscoveredDevice } from '@synra/capacitor-lan-discovery'
import { buildLocalPairInitiatorProfile } from '../lib/pair-profile'
import { resolveSelfOnLanForPairing } from '../lib/resolve-self-on-lan-for-pairing'
import { PAIR_MESSAGE_REQUEST, PAIR_MESSAGE_UNPAIR_REQUIRED } from '../lib/pair-protocol'
import { registerPairingOutbound } from '../lib/pairing-outbound-pending'
import { syncPairedDiscoveryExclusionFromRecords } from '../lib/discovery-paired-exclusion'
import {
  listPairedDeviceRecords,
  removePairedDeviceRecord,
  repairPairedDevicesPersistenceIfNeeded,
  type SynraPairedDeviceRecord
} from '../lib/paired-devices-storage'
import { useLanDiscoveryStore } from '../stores/lan-discovery'
import { usePairingStore } from '../stores/pairing'

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

export function useConnectPage() {
  const store = useLanDiscoveryStore()
  const pairingStore = usePairingStore()
  const { scanState, peers, connectedDeviceIds, connectedSessions, loading, error } =
    storeToRefs(store)
  const { pairedListEpoch, feedbackMessage } = storeToRefs(pairingStore)

  const pendingDeviceActionIds = ref<string[]>([])
  const pairedRecords = ref<SynraPairedDeviceRecord[]>([])

  function isDeviceActionPending(deviceId: string): boolean {
    return pendingDeviceActionIds.value.includes(deviceId)
  }

  function addPendingDeviceAction(deviceId: string): void {
    if (!isDeviceActionPending(deviceId)) {
      pendingDeviceActionIds.value = [...pendingDeviceActionIds.value, deviceId]
    }
  }

  function removePendingDeviceAction(deviceId: string): void {
    pendingDeviceActionIds.value = pendingDeviceActionIds.value.filter((id) => id !== deviceId)
  }

  async function refreshPairedRecords(): Promise<void> {
    await repairPairedDevicesPersistenceIfNeeded()
    pairedRecords.value = await listPairedDeviceRecords()
    syncPairedDiscoveryExclusionFromRecords(pairedRecords.value)
  }

  const discoveredIpv4Peers = computed(() =>
    peers.value.filter((device) => isIpv4Address(device.ipAddress))
  )

  const displayDevices = computed<DisplayDevice[]>(() =>
    mergePairedAndDiscoveredDevices(pairedRecords.value, discoveredIpv4Peers.value)
  )

  const linkToneByDeviceId = computed(() => {
    const transportPending = getPairedLinkPhases().value
    const pairAwaiting = getPairAwaitingAcceptDeviceIds().value
    const tones: Record<string, 'red' | 'yellow' | 'green' | 'gray'> = {}
    for (const device of displayDevices.value) {
      const id = device.deviceId
      const rowPending = pendingDeviceActionIds.value.includes(id)
      const anyPending = rowPending || transportPending.has(id) || pairAwaiting.has(id)
      if (anyPending) {
        tones[id] = 'yellow'
      } else if (connectedDeviceIds.value.includes(id)) {
        tones[id] = 'green'
      } else if (device.isPaired) {
        tones[id] = 'red'
      } else {
        tones[id] = 'gray'
      }
    }
    return tones
  })

  async function onScanDiscovery(): Promise<void> {
    await store.startScan()
  }

  async function onConnect(deviceId: string): Promise<void> {
    if (isDeviceActionPending(deviceId) || loading.value) {
      return
    }
    addPendingDeviceAction(deviceId)
    try {
      await store.connectToDevice(deviceId)
    } finally {
      removePendingDeviceAction(deviceId)
    }
  }

  async function onDisconnect(deviceId: string): Promise<void> {
    if (isDeviceActionPending(deviceId)) {
      return
    }
    addPendingDeviceAction(deviceId)
    try {
      await store.disconnectDevice(deviceId)
    } finally {
      removePendingDeviceAction(deviceId)
    }
  }

  async function onPairDevice(device: DiscoveredDevice): Promise<void> {
    if (isDeviceActionPending(device.deviceId) || loading.value) {
      return
    }
    addPendingDeviceAction(device.deviceId)
    setPairAwaitingAccept(device.deviceId, true)
    try {
      const sessionId = await store.connectToDevice(device.deviceId)
      if (!sessionId) {
        pairingStore.pushFeedback('Could not open session for pairing.')
        setPairAwaitingAccept(device.deviceId, false)
        void store.disconnectDevice(device.deviceId).catch(() => undefined)
        return
      }
      const requestId = crypto.randomUUID()
      registerPairingOutbound(requestId, device)
      const selfOnLan = await resolveSelfOnLanForPairing()
      const initiator = await buildLocalPairInitiatorProfile(selfOnLan)
      await store.sendConnectionMessage({
        sessionId,
        messageType: PAIR_MESSAGE_REQUEST,
        payload: { requestId, initiator }
      })
    } catch {
      pairingStore.pushFeedback('Pairing request failed.')
      setPairAwaitingAccept(device.deviceId, false)
      void store.disconnectDevice(device.deviceId).catch(() => undefined)
    } finally {
      removePendingDeviceAction(device.deviceId)
    }
  }

  async function onUnpairDevice(device: DisplayDevice): Promise<void> {
    if (isDeviceActionPending(device.deviceId)) {
      return
    }
    addPendingDeviceAction(device.deviceId)
    setPairAwaitingAccept(device.deviceId, false)
    try {
      const openedSession = connectedSessions.value.find(
        (session) => session.status === 'open' && session.deviceId === device.deviceId
      )
      if (openedSession?.sessionId) {
        await store
          .sendConnectionMessage({
            sessionId: openedSession.sessionId,
            messageType: PAIR_MESSAGE_UNPAIR_REQUIRED,
            payload: {
              mode: 'stale',
              reason: 'Peer manually removed this pairing.'
            }
          })
          .catch(() => undefined)
      }
      await removePairedDeviceRecord(device.deviceId)
      await refreshPairedRecords()
      pairingStore.bumpPairedList()
      await store.disconnectDevice(device.deviceId)
    } finally {
      removePendingDeviceAction(device.deviceId)
    }
  }

  onMounted(async () => {
    await store.ensureReady()
    await refreshPairedRecords()
  })

  watch(pairedListEpoch, () => {
    void refreshPairedRecords()
  })

  return {
    displayDevices,
    connectedDeviceIds,
    error,
    feedbackMessage,
    linkToneByDeviceId,
    loading,
    onConnect,
    onDisconnect,
    onPairDevice,
    onScanDiscovery,
    onUnpairDevice,
    pendingDeviceActionIds,
    scanState
  }
}
