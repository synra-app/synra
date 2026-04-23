import {
  getConnectionRuntime,
  getPairAwaitingAcceptDeviceIds,
  getPairedLinkPhases,
  mergePairedAndDiscoveredDevices,
  pairedDevicesStorageEpoch,
  setPairAwaitingAccept,
  type DisplayDevice
} from '@synra/hooks'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import type { DiscoveredDevice } from '@synra/capacitor-lan-discovery'
import { buildLocalPairInitiatorProfile } from '../lib/pair-profile'
import { resolveSelfOnLanForPairing } from '../lib/resolve-self-on-lan-for-pairing'
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
  const { scanState, peers, appReadyDeviceIds, connectedSessions, loading, error } =
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

  function deriveDeviceTone(input: {
    isPending: boolean
    isPairedReady: boolean
  }): 'yellow' | 'green' | 'gray' {
    const { isPending, isPairedReady } = input
    if (isPending) {
      return 'yellow'
    }
    if (isPairedReady) {
      return 'green'
    }
    return 'gray'
  }

  const linkToneByDeviceId = computed(() => {
    const transportPending = getPairedLinkPhases().value
    const pairAwaiting = getPairAwaitingAcceptDeviceIds().value
    const pendingActions = new Set(pendingDeviceActionIds.value)
    const pairedReady = new Set(appReadyDeviceIds.value)
    const tones: Record<string, 'yellow' | 'green' | 'gray'> = {}
    for (const device of displayDevices.value) {
      const deviceId = device.deviceId
      tones[deviceId] = deriveDeviceTone({
        isPending:
          pendingActions.has(deviceId) ||
          transportPending.has(deviceId) ||
          pairAwaiting.has(deviceId),
        isPairedReady: pairedReady.has(deviceId)
      })
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
      if (pairedRecords.value.some((row) => row.deviceId === deviceId)) {
        getConnectionRuntime().setAppLinkForDevice(deviceId, 'connected')
      }
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
      const targetDeviceId = await store.connectToDevice(device.deviceId)
      if (!targetDeviceId) {
        pairingStore.pushFeedback('Could not open session for pairing.')
        setPairAwaitingAccept(device.deviceId, false)
        getConnectionRuntime().setAppLinkForDevice(
          device.deviceId,
          'failed',
          'No session for pairing.'
        )
        return
      }
      const requestId = crypto.randomUUID()
      registerPairingOutbound(requestId, device)
      const selfOnLan = await resolveSelfOnLanForPairing()
      const initiator = await buildLocalPairInitiatorProfile(selfOnLan)
      await store.sendLanEvent({
        requestId,
        sourceDeviceId: initiator.deviceId,
        targetDeviceId,
        eventName: 'pairing.request',
        payload: {
          requestId,
          sourceDeviceId: initiator.deviceId,
          targetDeviceId,
          initiator
        }
      })
    } catch {
      pairingStore.pushFeedback('Pairing request failed.')
      setPairAwaitingAccept(device.deviceId, false)
      getConnectionRuntime().setAppLinkForDevice(
        device.deviceId,
        'failed',
        'Pairing request failed.'
      )
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
        (session) => session.transport === 'ready' && session.deviceId === device.deviceId
      )
      if (openedSession?.deviceId) {
        const requestId = crypto.randomUUID()
        await store
          .sendLanEvent({
            requestId,
            sourceDeviceId: 'local-device',
            targetDeviceId: device.deviceId,
            eventName: 'pairing.unpairRequired',
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

  watch(pairedDevicesStorageEpoch, () => {
    void refreshPairedRecords()
  })

  return {
    displayDevices,
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
