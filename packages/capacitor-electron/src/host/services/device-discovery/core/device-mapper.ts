import type { DiscoveredDevice } from '../../../../shared/protocol/types'
import { hashDeviceId } from './device-identity'

type DeviceSource = DiscoveredDevice['source']

function createDevice(
  key: string,
  name: string,
  ipAddress: string,
  source: DeviceSource,
  port?: number
): DiscoveredDevice {
  const now = Date.now()
  return {
    deviceId: hashDeviceId(key),
    name,
    ipAddress,
    port,
    source,
    connectable: false,
    discoveredAt: now,
    lastSeenAt: now
  }
}

/** Manual IP list is only used as TCP probe candidates; devices appear only after helloAck with displayName. */
export function toManualDevices(_targets: string[]): DiscoveredDevice[] {
  return []
}

/** mDNS/UDP yield IPv4 candidates only; name is filled by TCP probe (helloAck). */
export function toProbeCandidate(
  ipAddress: string,
  source: DeviceSource,
  port?: number
): DiscoveredDevice {
  return createDevice(`candidate:${ipAddress}`, '', ipAddress, source, port)
}
