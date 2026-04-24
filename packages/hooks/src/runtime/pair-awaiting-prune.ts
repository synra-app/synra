import type { DiscoveredDevice } from '@synra/capacitor-lan-discovery'
import type { Ref } from 'vue'
import type { RuntimeOpenTransportLink } from '../types'
import { normalizeHost } from './host-normalization'
import { getPairAwaitingAcceptDeviceIds, setPairAwaitingAccept } from './pair-awaiting-accept'
import { setPairedDeviceConnecting } from './paired-link-phases'

function hasReadyTransportLinkForPeer(
  deviceId: string,
  devices: DiscoveredDevice[],
  links: RuntimeOpenTransportLink[]
): boolean {
  const target = devices.find((peer) => peer.deviceId === deviceId)
  const targetHost = target ? normalizeHost(target.ipAddress ?? '') : ''
  return links.some((link) => {
    if (link.transport !== 'ready') {
      return false
    }
    if (link.deviceId === deviceId) {
      return true
    }
    if (!targetHost) {
      return false
    }
    return normalizeHost(link.host ?? '') === targetHost
  })
}

/** Clears pair-awaiting when no transport-ready link remains for that peer (scan / stale UI recovery). */
export function pruneStalePairAwaitingForOpenTransportLinks(
  devices: Ref<DiscoveredDevice[]>,
  openTransportLinks: Ref<RuntimeOpenTransportLink[]>
): void {
  const readyLinks = openTransportLinks.value.filter((link) => link.transport === 'ready')
  const awaiting = getPairAwaitingAcceptDeviceIds().value
  for (const deviceId of awaiting) {
    if (hasReadyTransportLinkForPeer(deviceId, devices.value, readyLinks)) {
      continue
    }
    setPairAwaitingAccept(deviceId, false)
    setPairedDeviceConnecting(deviceId, false)
  }
}
