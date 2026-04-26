import {
  getPairAwaitingAcceptDeviceIds,
  getPairedLinkPhases,
  mergePairedAndDiscoveredDevices,
  setPairAwaitingAccept,
  setPairedDeviceConnecting,
  type DisplayDevice
} from '@synra/hooks'
import { DEVICE_PAIRING_REQUEST_EVENT, DEVICE_PAIRING_UNPAIR_REQUIRED_EVENT } from '@synra/protocol'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref } from 'vue'
import type { DiscoveredDevice } from '@synra/capacitor-lan-discovery'
import { buildLocalPairInitiatorProfile } from '../lib/pair-profile'
import { isIpv4Address } from '../lib/network'
import { resolveSelfOnLanForPairing } from '../lib/resolve-self-on-lan-for-pairing'
import { registerPairingOutbound } from '../lib/pairing-outbound-pending'
import { removePairedDeviceRecord } from '../lib/paired-devices-storage'
import { tryOpenTransportForPairedRecord } from '../lib/connect-paired-record'
import { useLanDiscoveryStore } from '../stores/lan-discovery'
import { usePairedReconnectStore } from '../stores/paired-reconnect'
import { usePairingStore } from '../stores/pairing'
import { usePairingProtocolContext } from './use-pairing-protocol-context'

type DeviceViewState = {
  tone: 'yellow' | 'green' | 'gray'
  pending: boolean
  ready: boolean
}

function isTransportNotOpenError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }
  const message = error.message.toLowerCase()
  return message.includes('transport is not open') || message.includes('connection is not open')
}

export function useConnectPage() {
  const store = useLanDiscoveryStore()
  const pairingStore = usePairingStore()
  const pairingProtocol = usePairingProtocolContext()
  const { scanState, peers, openTransportLinks, loading, error } = storeToRefs(store)
  const { feedbackMessage, pairedRecords, pairedRecordsReady } = storeToRefs(pairingStore)
  const reconStore = usePairedReconnectStore()
  const { reconnectGaveUpByDeviceId } = storeToRefs(reconStore)

  const pendingDeviceActionIds = ref<string[]>([])

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

  const discoveredIpv4Peers = computed(() =>
    peers.value.filter((device) => isIpv4Address(device.ipAddress))
  )

  const readyDeviceIds = computed(
    () =>
      new Set(
        openTransportLinks.value
          .filter(
            (link) =>
              link.transport === 'ready' &&
              typeof link.deviceId === 'string' &&
              link.deviceId.length > 0
          )
          .map((link) => link.deviceId)
      )
  )

  const displayDevices = computed<DisplayDevice[]>(() =>
    mergePairedAndDiscoveredDevices(
      pairedRecords.value,
      discoveredIpv4Peers.value,
      readyDeviceIds.value,
      openTransportLinks.value
    )
  )
  const listLoading = computed(() => loading.value || !pairedRecordsReady.value)

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

  const deviceViewStateById = computed<Record<string, DeviceViewState>>(() => {
    const transportPending = getPairedLinkPhases().value
    const pairAwaiting = getPairAwaitingAcceptDeviceIds().value
    const pendingActions = new Set(pendingDeviceActionIds.value)
    const states: Record<string, DeviceViewState> = {}
    for (const device of displayDevices.value) {
      const deviceId = device.deviceId
      const pending =
        pendingActions.has(deviceId) || transportPending.has(deviceId) || pairAwaiting.has(deviceId)
      const ready = device.isPaired && readyDeviceIds.value.has(deviceId)
      states[deviceId] = {
        pending,
        ready,
        tone: deriveDeviceTone({
          isPending: pending,
          isPairedReady: ready
        })
      }
    }
    return states
  })

  const linkToneByDeviceId = computed(() => {
    const tones: Record<string, 'yellow' | 'green' | 'gray'> = {}
    for (const [deviceId, state] of Object.entries(deviceViewStateById.value)) {
      tones[deviceId] = state.tone
    }
    return tones
  })

  async function onScanDiscovery(): Promise<void> {
    // SYNRA-COMM::PLUGIN_BRIDGE::CONNECT::UI_START_SCAN
    await store.ensureReady()
    await store.startScan()
  }

  async function onConnect(deviceId: string): Promise<void> {
    // SYNRA-COMM::PLUGIN_BRIDGE::CONNECT::PAGE_CONNECT_DEVICE
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
    // SYNRA-COMM::PLUGIN_BRIDGE::CLOSE::PAGE_DISCONNECT_DEVICE
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
    // SYNRA-COMM::DEVICE_HANDSHAKE::SEND::PAGE_PAIRING_REQUEST
    if (isDeviceActionPending(device.deviceId) || loading.value) {
      return
    }
    addPendingDeviceAction(device.deviceId)
    setPairAwaitingAccept(device.deviceId, true)
    try {
      const targetDeviceId = await store.connectToDevice(device.deviceId)
      if (!targetDeviceId) {
        pairingStore.pushFeedback('Could not open transport for pairing.')
        setPairAwaitingAccept(device.deviceId, false)
        return
      }
      const requestId = crypto.randomUUID()
      registerPairingOutbound(requestId, device)
      const selfOnLan = await resolveSelfOnLanForPairing()
      const initiator = await buildLocalPairInitiatorProfile(selfOnLan)
      const payload = {
        requestId,
        from: initiator.deviceId,
        target: targetDeviceId,
        initiator
      }
      try {
        await store.sendLanEvent({
          requestId,
          from: initiator.deviceId,
          target: targetDeviceId,
          event: DEVICE_PAIRING_REQUEST_EVENT,
          payload
        })
      } catch (error) {
        if (!isTransportNotOpenError(error)) {
          throw error
        }
        const retriedTargetDeviceId = await store.connectToDevice(device.deviceId, {
          suppressGlobalError: true
        })
        if (!retriedTargetDeviceId) {
          throw error
        }
        await store.sendLanEvent({
          requestId,
          from: initiator.deviceId,
          target: retriedTargetDeviceId,
          event: DEVICE_PAIRING_REQUEST_EVENT,
          payload: {
            ...payload,
            target: retriedTargetDeviceId
          }
        })
      }
    } catch {
      pairingStore.pushFeedback('Pairing request failed.')
      setPairAwaitingAccept(device.deviceId, false)
    } finally {
      removePendingDeviceAction(device.deviceId)
    }
  }

  async function onUnpairDevice(device: DisplayDevice): Promise<void> {
    // SYNRA-COMM::DEVICE_HANDSHAKE::SEND::PAGE_UNPAIR_EVENT
    if (isDeviceActionPending(device.deviceId)) {
      return
    }
    addPendingDeviceAction(device.deviceId)
    setPairAwaitingAccept(device.deviceId, false)
    try {
      const openedLink = openTransportLinks.value.find(
        (link) => link.transport === 'ready' && link.deviceId === device.deviceId
      )
      if (openedLink?.deviceId) {
        const requestId = crypto.randomUUID()
        await store
          .sendLanEvent({
            requestId,
            from: 'local-device',
            target: device.deviceId,
            event: DEVICE_PAIRING_UNPAIR_REQUIRED_EVENT,
            payload: {
              mode: 'stale',
              reason: 'Peer manually removed this pairing.'
            }
          })
          .catch(() => undefined)
      }
      const localUnpairReason = 'Peer manually removed this pairing.'
      if (pairingProtocol.value) {
        await pairingProtocol.value.unpairLocalOnly(device.deviceId, localUnpairReason)
      } else {
        pairingStore.clearIncomingIfRelated(device.deviceId)
        await removePairedDeviceRecord(device.deviceId)
        pairingStore.bumpPairedList()
        setPairedDeviceConnecting(device.deviceId, false)
        pairingStore.pushFeedback(localUnpairReason)
      }
      await store.disconnectDevice(device.deviceId)
    } finally {
      reconStore.forgetPairedDevice(device.deviceId)
      removePendingDeviceAction(device.deviceId)
    }
  }

  async function onManualPairedReconnect(deviceId: string): Promise<void> {
    if (isDeviceActionPending(deviceId) || loading.value) {
      return
    }
    reconStore.clearGaveUp(deviceId)
    const sched = reconStore.getScheduler()
    const record = pairedRecords.value.find((row) => row.deviceId === deviceId)
    if (!record) {
      return
    }
    addPendingDeviceAction(deviceId)
    try {
      const ok = await tryOpenTransportForPairedRecord(
        {
          isTransportReady: (id) => readyDeviceIds.value.has(id),
          peers: () => peers.value,
          connectToDevice: store.connectToDevice,
          connectToDeviceAt: store.connectToDeviceAt
        },
        record
      )
      if (!ok) {
        sched?.restartAfterManualIfStillDisconnected(deviceId, false)
      }
    } finally {
      removePendingDeviceAction(deviceId)
    }
  }

  onMounted(() => {
    if (!pairedRecordsReady.value) {
      void pairingStore.refreshPairedRecords()
    }
    void store.ensureReady().catch(() => undefined)
  })

  return {
    displayDevices,
    error,
    feedbackMessage,
    linkToneByDeviceId,
    loading: listLoading,
    onConnect,
    onDisconnect,
    onManualPairedReconnect,
    onPairDevice,
    reconnectGaveUpByDeviceId,
    onScanDiscovery,
    onUnpairDevice,
    pendingDeviceActionIds,
    scanState
  }
}
