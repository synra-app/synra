import type { DiscoveredDevice } from '@synra/capacitor-lan-discovery'
import type { Ref } from 'vue'
import type { RuntimeConnectedSession } from '../types'
import { normalizeHost } from './host-normalization'
import { getPairAwaitingAcceptDeviceIds, setPairAwaitingAccept } from './pair-awaiting-accept'
import { setPairedDeviceConnecting } from './paired-link-phases'

function hasOpenSessionForPeer(
  deviceId: string,
  devices: DiscoveredDevice[],
  openSessions: RuntimeConnectedSession[]
): boolean {
  const target = devices.find((peer) => peer.deviceId === deviceId)
  const targetHost = target ? normalizeHost(target.ipAddress ?? '') : ''
  return openSessions.some((session) => {
    if (session.deviceId === deviceId) {
      return true
    }
    if (!targetHost) {
      return false
    }
    return normalizeHost(session.host ?? '') === targetHost
  })
}

/** Clears pair-awaiting when no open session remains for that peer (scan / stale UI recovery). */
export function pruneStalePairAwaitingForOpenSessions(
  devices: Ref<DiscoveredDevice[]>,
  connectedSessions: Ref<RuntimeConnectedSession[]>
): void {
  const openSessions = connectedSessions.value.filter((session) => session.status === 'open')
  const awaiting = getPairAwaitingAcceptDeviceIds().value
  for (const deviceId of awaiting) {
    if (hasOpenSessionForPeer(deviceId, devices.value, openSessions)) {
      continue
    }
    setPairAwaitingAccept(deviceId, false)
    setPairedDeviceConnecting(deviceId, false)
  }
}
