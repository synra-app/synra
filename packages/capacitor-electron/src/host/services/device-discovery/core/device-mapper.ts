import type { DiscoveredDevice } from '../../../../shared/protocol/types'

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
    deviceId: key.trim(),
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
  port?: number,
  sourceDeviceUuid?: string
): DiscoveredDevice {
  const key = typeof sourceDeviceUuid === 'string' ? sourceDeviceUuid.trim() : ''
  if (key.length === 0) {
    return createDevice('', '', ipAddress, source, port)
  }
  return createDevice(key, '', ipAddress, source, port)
}
