import type { DiscoveredDevice } from '@synra/capacitor-lan-discovery'

export function sortDevices(devices: DiscoveredDevice[]): DiscoveredDevice[] {
  return [...devices].sort((left, right) => right.lastSeenAt - left.lastSeenAt)
}
