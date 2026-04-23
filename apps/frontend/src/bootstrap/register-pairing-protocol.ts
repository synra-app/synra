import type { Pinia } from 'pinia'
import {
  getConnectionRuntime,
  setPairAwaitingAccept,
  setPairedDeviceConnecting
} from '@synra/hooks'
import { consumePairingOutbound } from '../lib/pairing-outbound-pending'
import {
  listPairedDeviceRecords,
  removePairedDeviceRecord,
  upsertPairedDeviceRecord
} from '../lib/paired-devices-storage'
import { syncPairedDiscoveryExclusionFromRecords } from '../lib/discovery-paired-exclusion'
import { isPairRequestPayload } from '../lib/pair-protocol'
import { usePairingStore } from '../stores/pairing'

export async function registerPairingProtocol(pinia: Pinia): Promise<void> {
  const runtime = getConnectionRuntime()
  await runtime.ensureListeners()
  const pairingStore = usePairingStore(pinia)
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

  runtime.onLanWireEvent(
    (evt) => {
      if (!isPairRequestPayload(evt.payload)) {
        return
      }
      if (pairingStore.hasOpenIncoming()) {
        return
      }
      pairingStore.setIncoming({
        requestId: evt.payload.requestId,
        sourceDeviceId: evt.sourceDeviceId,
        targetDeviceId: evt.targetDeviceId,
        initiator: evt.payload.initiator
      })
      setPairAwaitingAccept(evt.payload.initiator.deviceId, true)
    },
    { eventName: 'pairing.request' }
  )

  runtime.onLanWireEvent(
    (evt) => {
      const pl = evt.payload
      if (!pl || typeof pl !== 'object') {
        return
      }
      const requestIdCandidate = (pl as { replyToRequestId?: unknown; requestId?: unknown })
        .replyToRequestId
      const requestId =
        typeof requestIdCandidate === 'string'
          ? requestIdCandidate
          : (pl as { requestId?: unknown }).requestId
      const accepted = (pl as { accepted?: unknown }).accepted
      if (typeof requestId !== 'string' || typeof accepted !== 'boolean') {
        return
      }
      if (accepted) {
        const pending = consumePairingOutbound(requestId)
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
        return
      }
      const rejected = consumePairingOutbound(requestId)
      if (rejected) {
        setPairAwaitingAccept(rejected.target.deviceId, false)
        setPairedDeviceConnecting(rejected.target.deviceId, false)
        runtime.setAppLinkForDevice(rejected.target.deviceId, 'failed', 'Pairing was declined.')
      } else {
        const declinedDeviceId = evt.sourceDeviceId
        if (declinedDeviceId) {
          setPairAwaitingAccept(declinedDeviceId, false)
          setPairedDeviceConnecting(declinedDeviceId, false)
          runtime.setAppLinkForDevice(declinedDeviceId, 'failed', 'Pairing was declined.')
        }
      }
      const reason =
        typeof (pl as { reason?: unknown }).reason === 'string' &&
        (pl as { reason: string }).reason.trim().length > 0
          ? (pl as { reason: string }).reason.trim()
          : 'Pairing was declined.'
      pairingStore.pushFeedback(reason)
    },
    { eventName: 'pairing.response' }
  )

  runtime.onLanWireEvent(
    async (evt) => {
      const pl =
        evt.payload && typeof evt.payload === 'object'
          ? (evt.payload as { fromDeviceId?: unknown; reason?: unknown })
          : {}
      const fromDeviceId =
        typeof pl.fromDeviceId === 'string' && pl.fromDeviceId.trim().length > 0
          ? pl.fromDeviceId.trim()
          : undefined
      if (!fromDeviceId) {
        return
      }
      const reason =
        typeof pl.reason === 'string' && pl.reason.trim().length > 0
          ? pl.reason.trim()
          : 'Peer cleared this pairing.'
      await removePairedDeviceRecord(fromDeviceId)
      const next = await listPairedDeviceRecords()
      syncPairedDiscoveryExclusionFromRecords(next)
      pairingStore.bumpPairedList()
      setPairAwaitingAccept(fromDeviceId, false)
      setPairedDeviceConnecting(fromDeviceId, false)
      runtime.setAppLinkForDevice(fromDeviceId, 'disconnected', reason)
      pairingStore.pushFeedback(reason)
    },
    { eventName: 'pairing.peerReset' }
  )

  runtime.onLanWireEvent(
    async (evt) => {
      const deviceId = evt.sourceDeviceId
      if (!deviceId) {
        return
      }
      const pl =
        evt.payload && typeof evt.payload === 'object'
          ? (evt.payload as { reason?: unknown; mode?: unknown })
          : {}
      const reason =
        typeof pl.reason === 'string' && pl.reason.trim().length > 0
          ? pl.reason.trim()
          : 'Peer requested to cancel pairing.'
      await unpairLocalOnly(deviceId, reason)
    },
    { eventName: 'pairing.unpairRequired' }
  )
}
