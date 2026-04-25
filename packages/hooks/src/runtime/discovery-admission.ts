import type { DiscoveredDevice } from '@synra/capacitor-lan-discovery'
import { getHooksRuntimeOptions, isLocalDiscoveryDeviceId } from './config'
import { shouldExposeDiscoveredDevice } from './discovery-exposure'

export function shouldKeepDiscoveredDeviceId(deviceId: string): boolean {
  if (isLocalDiscoveryDeviceId(deviceId)) {
    return false
  }
  const exclude = getHooksRuntimeOptions().shouldExcludeDiscoveredDevice
  return !(typeof exclude === 'function' && exclude(deviceId))
}

export function shouldKeepDiscoveredDevice(device: DiscoveredDevice): boolean {
  if (!shouldKeepDiscoveredDeviceId(device.deviceId)) {
    return false
  }
  return shouldExposeDiscoveredDevice(device)
}

export function filterAdmittedDiscoveredDevices(rows: DiscoveredDevice[]): DiscoveredDevice[] {
  return rows.filter((row) => shouldKeepDiscoveredDevice(row))
}
