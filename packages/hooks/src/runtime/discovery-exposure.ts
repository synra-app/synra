import type { DiscoveredDevice } from '@synra/capacitor-lan-discovery'

function hasSynraHandshakeProof(device: DiscoveredDevice): boolean {
  if (!device.connectable) {
    return false
  }
  if (device.source !== 'probe' && device.source !== 'session') {
    return false
  }
  if (typeof device.connectCheckAt !== 'number' || device.connectCheckAt <= 0) {
    return false
  }
  if (typeof device.connectCheckError === 'string' && device.connectCheckError.trim().length > 0) {
    return false
  }
  return true
}

export function shouldExposeDiscoveredDevice(device: DiscoveredDevice): boolean {
  return hasSynraHandshakeProof(device)
}

export function filterExposedDiscoveredDevices(rows: DiscoveredDevice[]): DiscoveredDevice[] {
  return rows.filter(shouldExposeDiscoveredDevice)
}
