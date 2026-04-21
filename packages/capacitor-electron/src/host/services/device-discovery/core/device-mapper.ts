import type { DiscoveredDevice } from '../../../../shared/protocol/types'
import { hashDeviceId } from './device-identity'

type DeviceSource = DiscoveredDevice['source']

function createDevice(
  key: string,
  name: string,
  ipAddress: string,
  source: DeviceSource
): DiscoveredDevice {
  const now = Date.now()
  return {
    deviceId: hashDeviceId(key),
    name,
    ipAddress,
    source,
    connectable: false,
    discoveredAt: now,
    lastSeenAt: now
  }
}

export function toManualDevices(targets: string[]): DiscoveredDevice[] {
  return targets
    .map((target) => target.trim())
    .filter((target) => target.length > 0)
    .map((target, index) =>
      createDevice(`manual:${target}`, `Manual Target ${index + 1}`, target, 'manual')
    )
}

export function toDiscoveredDevice(
  ipAddress: string,
  source: DeviceSource,
  name?: string
): DiscoveredDevice {
  return createDevice(`auto:${ipAddress}`, name ?? `Synra Device ${ipAddress}`, ipAddress, source)
}
