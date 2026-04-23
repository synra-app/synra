import type { Pinia } from 'pinia'
import {
  getConnectionRuntime,
  setPairAwaitingAccept,
  setPairedDeviceConnecting
} from '@synra/hooks'
import {
  PAIR_MESSAGE_ACCEPT,
  PAIR_MESSAGE_REJECT,
  PAIR_MESSAGE_REQUEST,
  PAIR_MESSAGE_UNPAIR_REQUIRED,
  isPairDecisionPayload,
  isPairUnpairRequiredPayload,
  isPairRequestPayload
} from '../lib/pair-protocol'
import { consumePairingOutbound } from '../lib/pairing-outbound-pending'
import {
  listPairedDeviceRecords,
  removePairedDeviceRecord,
  upsertPairedDeviceRecord
} from '../lib/paired-devices-storage'
import { syncPairedDiscoveryExclusionFromRecords } from '../lib/discovery-paired-exclusion'
import { usePairingStore } from '../stores/pairing'

export async function registerPairingProtocol(pinia: Pinia): Promise<void> {
  const runtime = getConnectionRuntime()
  await runtime.ensureListeners()
  const pairingStore = usePairingStore(pinia)
  const findDeviceIdByTransportReadySessionId = (sessionId: string): string | undefined => {
    const match = runtime.connectedSessions.value.find(
      (session) =>
        session.sessionId === sessionId &&
        session.transport === 'ready' &&
        typeof session.deviceId === 'string' &&
        session.deviceId.length > 0
    )
    return match?.deviceId
  }
  const unpairLocalOnly = async (deviceId: string, reason: string): Promise<void> => {
    await removePairedDeviceRecord(deviceId)
    const next = await listPairedDeviceRecords()
    syncPairedDiscoveryExclusionFromRecords(next)
    pairingStore.bumpPairedList()
    setPairAwaitingAccept(deviceId, false)
    setPairedDeviceConnecting(deviceId, false)
    runtime.setAppLinkForDevice(deviceId, 'disconnected')
    pairingStore.pushFeedback(reason)
  }

  runtime.onMessage(
    (message) => {
      if (!isPairRequestPayload(message.payload)) {
        return
      }
      if (pairingStore.hasOpenIncoming()) {
        return
      }
      pairingStore.setIncoming({
        requestId: message.payload.requestId,
        sessionId: message.sessionId,
        initiator: message.payload.initiator
      })
      setPairAwaitingAccept(message.payload.initiator.deviceId, true)
    },
    { messageType: PAIR_MESSAGE_REQUEST }
  )

  runtime.onMessage(
    (message) => {
      if (message.messageType !== PAIR_MESSAGE_ACCEPT) {
        return
      }
      if (!isPairDecisionPayload(message.payload)) {
        return
      }
      const pending = consumePairingOutbound(message.payload.requestId)
      if (!pending) {
        return
      }
      const target = pending.target
      setPairAwaitingAccept(target.deviceId, false)
      setPairedDeviceConnecting(target.deviceId, false)
      void upsertPairedDeviceRecord({
        deviceId: target.deviceId,
        displayName: target.name,
        pairedAt: Date.now(),
        lastResolvedHost: target.ipAddress,
        lastResolvedPort: target.port ?? 32100
      }).then(
        () => {
          pairingStore.bumpPairedList()
          pairingStore.pushFeedback('Pairing completed.')
          runtime.setAppLinkForDevice(target.deviceId, 'connected')
        },
        () => {
          pairingStore.pushFeedback('Failed to save paired device.')
        }
      )
    },
    { messageType: PAIR_MESSAGE_ACCEPT }
  )

  runtime.onMessage(
    (message) => {
      if (message.messageType !== PAIR_MESSAGE_REJECT) {
        return
      }
      if (!isPairDecisionPayload(message.payload)) {
        return
      }
      const rejected = consumePairingOutbound(message.payload.requestId)
      if (rejected) {
        setPairAwaitingAccept(rejected.target.deviceId, false)
        setPairedDeviceConnecting(rejected.target.deviceId, false)
        runtime.setAppLinkForDevice(rejected.target.deviceId, 'failed', 'Pairing was declined.')
      } else {
        const sid = message.sessionId
        if (typeof sid === 'string' && sid.length > 0) {
          const deviceId = findDeviceIdByTransportReadySessionId(sid)
          if (deviceId) {
            setPairAwaitingAccept(deviceId, false)
            setPairedDeviceConnecting(deviceId, false)
            runtime.setAppLinkForDevice(deviceId, 'failed', 'Pairing was declined.')
          }
        }
      }
      const reason =
        typeof message.payload.reason === 'string' && message.payload.reason.trim().length > 0
          ? message.payload.reason.trim()
          : 'Pairing was declined.'
      pairingStore.pushFeedback(reason)
    },
    { messageType: PAIR_MESSAGE_REJECT }
  )

  runtime.onMessage(
    (message) => {
      if (message.messageType !== PAIR_MESSAGE_UNPAIR_REQUIRED) {
        return
      }
      if (!isPairUnpairRequiredPayload(message.payload)) {
        return
      }
      const deviceId = findDeviceIdByTransportReadySessionId(message.sessionId)
      if (!deviceId) {
        return
      }
      const reason =
        typeof message.payload.reason === 'string' && message.payload.reason.trim().length > 0
          ? message.payload.reason.trim()
          : 'Peer requested to cancel pairing.'
      void unpairLocalOnly(deviceId, reason).catch(() => undefined)
    },
    { messageType: PAIR_MESSAGE_UNPAIR_REQUIRED }
  )
}
