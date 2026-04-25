import type { DiscoveredDevice } from '@synra/capacitor-lan-discovery'
import type { RuntimeOpenTransportLink } from '../types'
import { normalizeHost } from './host-normalization'

export function findReadyTransportLinkForDevice(options: {
  deviceId: string
  devices: readonly DiscoveredDevice[]
  links: readonly RuntimeOpenTransportLink[]
}): RuntimeOpenTransportLink | undefined {
  const { deviceId, devices, links } = options
  const target = devices.find((peer) => peer.deviceId === deviceId)
  const targetHost = target ? normalizeHost(target.ipAddress) : ''
  return links.find((link) => {
    if (link.transport !== 'ready') {
      return false
    }
    if (link.deviceId === deviceId) {
      return true
    }
    if (targetHost.length === 0) {
      return false
    }
    return normalizeHost(link.host) === targetHost
  })
}
