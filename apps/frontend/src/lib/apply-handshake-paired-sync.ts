import {
  getConnectionRuntime,
  getHooksRuntimeOptions,
  setPairedDeviceConnecting
} from '@synra/hooks'
import type { Pinia } from 'pinia'
import { syncPairedDiscoveryExclusionFromRecords } from './discovery-paired-exclusion'
import { listPairedDeviceRecords, removePairedDeviceRecord } from './paired-devices-storage'
import { PAIR_MESSAGE_UNPAIR_REQUIRED } from './pair-protocol'
import { useLanDiscoveryStore } from '../stores/lan-discovery'
import { usePairingStore } from '../stores/pairing'

/**
 * After helloAck: if the peer no longer lists our LAN `deviceId` among its paired partners but we
 * still store them as paired, drop the stale pairing locally and refresh discovery exclusion.
 */
export async function applyHandshakePairedSync(options: {
  pinia: Pinia
  peerDeviceId: string
  theirPairedPeerDeviceIds: string[]
  /** Session just opened on helloAck; close it after dropping stale pairing so UI does not stay green. */
  openedSessionId?: string
  remoteHandshakeKind?: 'paired' | 'fresh'
  remoteClaimsPeerPaired?: boolean
}): Promise<void> {
  const localId = getHooksRuntimeOptions().localDiscoveryDeviceId
  if (typeof localId !== 'string' || localId.length === 0) {
    return
  }
  const peerId = options.peerDeviceId.trim()
  if (!peerId) {
    return
  }
  const their = new Set(
    options.theirPairedPeerDeviceIds.map((id) => id.trim()).filter((id) => id.length > 0)
  )
  const remoteListsLocal = their.has(localId)
  const records = await listPairedDeviceRecords()
  const hasLocalPair = records.some((record) => record.deviceId === peerId)
  const sid = options.openedSessionId?.trim()
  const runtime = getConnectionRuntime()
  const lanStore = useLanDiscoveryStore(options.pinia)
  const pairingStore = usePairingStore(options.pinia)
  const closeAndDisconnect = async (): Promise<void> => {
    if (sid) {
      await runtime.closeSession(sid).catch(() => undefined)
    }
    await lanStore.disconnectDevice(peerId).catch(() => undefined)
  }

  if (!hasLocalPair) {
    const shouldRequestUnpair =
      options.remoteClaimsPeerPaired === true || options.remoteHandshakeKind === 'paired'
    if (shouldRequestUnpair && sid) {
      await runtime
        .sendMessage({
          sessionId: sid,
          messageType: PAIR_MESSAGE_UNPAIR_REQUIRED,
          payload: {
            mode: 'stale',
            reason: 'Peer is no longer paired on this device.'
          }
        })
        .catch(() => undefined)
      setPairedDeviceConnecting(peerId, false)
      await closeAndDisconnect()
    }
    return
  }

  const shouldDropForFreshHandshake = options.remoteHandshakeKind === 'fresh'
  const shouldDropForStaleAck = !remoteListsLocal
  if (!shouldDropForFreshHandshake && !shouldDropForStaleAck) {
    return
  }

  await removePairedDeviceRecord(peerId)
  const next = records.filter((record) => record.deviceId !== peerId)
  syncPairedDiscoveryExclusionFromRecords(next)
  pairingStore.bumpPairedList()

  setPairedDeviceConnecting(peerId, false)

  await closeAndDisconnect()
}
