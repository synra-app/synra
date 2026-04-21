import type { DeviceDiscoveryListResult, DiscoveredDevice } from '../../../../shared/protocol/types'

type DeviceMap = Map<string, DiscoveredDevice>

export interface DeviceRegistry {
  reset(): void
  merge(devices: DiscoveredDevice[]): void
  upsert(device: DiscoveredDevice): void
  removeByIpSet(ipSet: Set<string>): void
  list(): DiscoveredDevice[]
  snapshot(
    state: DeviceDiscoveryListResult['state'],
    startedAt?: number,
    scanWindowMs?: number
  ): DeviceDiscoveryListResult
}

function mergeRecord(
  previous: DiscoveredDevice | undefined,
  next: DiscoveredDevice
): DiscoveredDevice {
  const now = Date.now()
  if (!previous) {
    return {
      ...next,
      discoveredAt: next.discoveredAt || now,
      lastSeenAt: next.lastSeenAt || now
    }
  }
  return {
    ...previous,
    ...next,
    discoveredAt: previous.discoveredAt,
    lastSeenAt: now
  }
}

export function createDeviceRegistry(): DeviceRegistry {
  const devices: DeviceMap = new Map()

  return {
    reset() {
      devices.clear()
    },
    merge(nextDevices) {
      for (const device of nextDevices) {
        this.upsert(device)
      }
    },
    upsert(device) {
      devices.set(device.deviceId, mergeRecord(devices.get(device.deviceId), device))
    },
    removeByIpSet(ipSet) {
      for (const [deviceId, device] of devices.entries()) {
        if (ipSet.has(device.ipAddress)) {
          devices.delete(deviceId)
        }
      }
    },
    list() {
      return [...devices.values()]
    },
    snapshot(state, startedAt, scanWindowMs = 15_000) {
      return {
        state,
        startedAt,
        scanWindowMs,
        devices: [...devices.values()]
      }
    }
  }
}
