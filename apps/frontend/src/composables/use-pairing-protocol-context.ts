import type { Pinia } from 'pinia'
import type { ShallowRef } from 'vue'
import { inject, type InjectionKey, shallowRef } from 'vue'
import {
  createSynraEvent,
  synraHandlersAllPlatforms,
  type SynraWireEventContext
} from '@synra/transport-events'
import {
  DEVICE_PAIRING_PEER_RESET_EVENT,
  DEVICE_PAIRING_REQUEST_EVENT,
  DEVICE_PAIRING_RESPONSE_EVENT,
  DEVICE_PAIRING_UNPAIR_REQUIRED_EVENT
} from '@synra/protocol'
import { setPairAwaitingAccept, setPairedDeviceConnecting } from '@synra/hooks'
import { consumePairingOutbound } from '../lib/pairing-outbound-pending'
import {
  listPairedDeviceRecords,
  removePairedDeviceRecord,
  upsertPairedDeviceRecord
} from '../lib/paired-devices-storage'
import { syncPairedDiscoveryExclusionFromRecords } from '../lib/discovery-paired-exclusion'
import { isPairRequestPayload, type PairRequestPayload } from '../lib/pair-protocol'
import {
  parsePairingPeerResetPayload,
  parsePairingResponsePayload,
  parsePairingUnpairRequiredReason
} from '../lib/pair-wire-payloads'
import { usePairingStore } from '../stores/pairing'

export type PairingProtocolContext = {
  unpairLocalOnly(deviceId: string, reason: string): Promise<void>
  registerLanSynraWireHandlers(): void
}

export const PAIRING_PROTOCOL_KEY: InjectionKey<ShallowRef<PairingProtocolContext | null>> =
  Symbol('synra.pairingProtocol')

/**
 * Injected ref is filled after async bootstrap calls {@link registerPairingProtocol}.
 * Use optional chaining when calling before holder is set.
 */
export function usePairingProtocolContext(): ShallowRef<PairingProtocolContext | null> {
  const holder = inject(PAIRING_PROTOCOL_KEY, null)
  if (holder === null) {
    return shallowRef<PairingProtocolContext | null>(null)
  }
  return holder
}

export function createPairingProtocolContext(pinia: Pinia): PairingProtocolContext {
  const pairingStore = usePairingStore(pinia)

  async function unpairLocalOnly(deviceId: string, reason: string): Promise<void> {
    pairingStore.clearIncomingIfRelated(deviceId)
    await removePairedDeviceRecord(deviceId)
    const next = await listPairedDeviceRecords()
    syncPairedDiscoveryExclusionFromRecords(next)
    pairingStore.bumpPairedList()
    setPairAwaitingAccept(deviceId, false)
    setPairedDeviceConnecting(deviceId, false)
    pairingStore.pushFeedback(reason)
  }

  function registerLanSynraWireHandlers(): void {
    createSynraEvent({
      event: DEVICE_PAIRING_REQUEST_EVENT,
      handlers: synraHandlersAllPlatforms((ctx: SynraWireEventContext) => {
        const wirePayload = ctx.payload
        if (pairingStore.hasOpenIncoming()) {
          return
        }
        if (!isPairRequestPayload(wirePayload)) {
          return
        }
        const pairPayload: PairRequestPayload = wirePayload
        pairingStore.setIncoming({
          requestId: pairPayload.requestId,
          from: ctx.from,
          target: ctx.target,
          initiator: pairPayload.initiator
        })
        setPairAwaitingAccept(pairPayload.initiator.deviceId, true)
      })
    })

    createSynraEvent({
      event: DEVICE_PAIRING_RESPONSE_EVENT,
      handlers: synraHandlersAllPlatforms((ctx: SynraWireEventContext) => {
        const parsed = parsePairingResponsePayload(ctx.payload)
        if (!parsed) {
          return
        }
        const { requestId, accepted, reason: responseReason } = parsed
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
        } else {
          const declinedDeviceId = ctx.from
          if (declinedDeviceId) {
            setPairAwaitingAccept(declinedDeviceId, false)
            setPairedDeviceConnecting(declinedDeviceId, false)
          }
        }
        const reason =
          typeof responseReason === 'string' && responseReason.trim().length > 0
            ? responseReason.trim()
            : 'Pairing was declined.'
        pairingStore.pushFeedback(reason)
      })
    })

    createSynraEvent({
      event: DEVICE_PAIRING_PEER_RESET_EVENT,
      handlers: synraHandlersAllPlatforms(async (ctx: SynraWireEventContext) => {
        const parsed = parsePairingPeerResetPayload(ctx.payload)
        if (!parsed) {
          return
        }
        await unpairLocalOnly(parsed.from, parsed.reason)
      })
    })

    createSynraEvent({
      event: DEVICE_PAIRING_UNPAIR_REQUIRED_EVENT,
      handlers: synraHandlersAllPlatforms(async (ctx: SynraWireEventContext) => {
        const deviceId = ctx.from
        if (!deviceId) {
          return
        }
        const reason = parsePairingUnpairRequiredReason(
          ctx.payload,
          'Peer requested to cancel pairing.'
        )
        await unpairLocalOnly(deviceId, reason)
      })
    })
  }

  return { unpairLocalOnly, registerLanSynraWireHandlers }
}
