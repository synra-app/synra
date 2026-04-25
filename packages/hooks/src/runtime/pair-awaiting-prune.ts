import type { DiscoveredDevice } from '@synra/capacitor-lan-discovery'
import type { Ref } from 'vue'
import type { RuntimeOpenTransportLink } from '../types'
import { getPairAwaitingAcceptDeviceIds, setPairAwaitingAccept } from './pair-awaiting-accept'
import { setPairedDeviceConnecting } from './paired-link-phases'
import { findReadyTransportLinkForDevice } from './ready-transport-link'

/** Clears pair-awaiting when no transport-ready link remains for that peer (scan / stale UI recovery). */
export function pruneStalePairAwaitingForOpenTransportLinks(
  devices: Ref<DiscoveredDevice[]>,
  openTransportLinks: Ref<RuntimeOpenTransportLink[]>
): void {
  const readyLinks = openTransportLinks.value.filter((link) => link.transport === 'ready')
  const awaiting = getPairAwaitingAcceptDeviceIds().value
  for (const deviceId of awaiting) {
    if (findReadyTransportLinkForDevice({ deviceId, devices: devices.value, links: readyLinks })) {
      continue
    }
    setPairAwaitingAccept(deviceId, false)
    setPairedDeviceConnecting(deviceId, false)
  }
}
