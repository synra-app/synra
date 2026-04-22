import {
  getConnectionRuntime,
  getHooksRuntimeOptions,
  setPairedDeviceConnecting
} from '@synra/hooks'
import type { Pinia } from 'pinia'
import { syncPairedDiscoveryExclusionFromRecords } from './discovery-paired-exclusion'
import { listPairedDeviceRecords, removePairedDeviceRecord } from './paired-devices-storage'
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
  if (their.has(localId)) {
    return
  }
  const records = await listPairedDeviceRecords()
  if (!records.some((r) => r.deviceId === peerId)) {
    return
  }
  await removePairedDeviceRecord(peerId)
  const next = await listPairedDeviceRecords()
  syncPairedDiscoveryExclusionFromRecords(next)
  usePairingStore(options.pinia).bumpPairedList()

  setPairedDeviceConnecting(peerId, false)

  const runtime = getConnectionRuntime()
  const sid = options.openedSessionId?.trim()
  if (sid) {
    await runtime.closeSession(sid).catch(() => undefined)
  }
  await useLanDiscoveryStore(options.pinia)
    .disconnectDevice(peerId)
    .catch(() => undefined)
}
