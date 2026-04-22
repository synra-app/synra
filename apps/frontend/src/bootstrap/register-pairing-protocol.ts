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
  isPairDecisionPayload,
  isPairRequestPayload
} from '../lib/pair-protocol'
import { consumePairingOutbound } from '../lib/pairing-outbound-pending'
import { upsertPairedDeviceRecord } from '../lib/paired-devices-storage'
import { useLanDiscoveryStore } from '../stores/lan-discovery'
import { usePairingStore } from '../stores/pairing'

export async function registerPairingProtocol(pinia: Pinia): Promise<void> {
  const runtime = getConnectionRuntime()
  await runtime.ensureListeners()
  const pairingStore = usePairingStore(pinia)
  const lanStore = useLanDiscoveryStore(pinia)

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
        void lanStore.disconnectDevice(rejected.target.deviceId).catch(() => undefined)
      } else {
        const sid = message.sessionId
        if (typeof sid === 'string' && sid.length > 0) {
          const match = runtime.connectedSessions.value.find(
            (s) =>
              s.sessionId === sid &&
              s.status === 'open' &&
              typeof s.deviceId === 'string' &&
              s.deviceId.length > 0
          )
          if (match?.deviceId) {
            setPairAwaitingAccept(match.deviceId, false)
            setPairedDeviceConnecting(match.deviceId, false)
            void lanStore.disconnectDevice(match.deviceId).catch(() => undefined)
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
}
