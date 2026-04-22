import type { DiscoveredDevice } from '@synra/capacitor-lan-discovery'
import type { SynraPairedDeviceRecord } from '@synra/capacitor-preferences'

export type DisplayDevice = DiscoveredDevice & {
  isPaired: boolean
  pairedAt?: number
}

/**
 * Paired rows first (by `pairedAt` desc), then unpaired discovery rows (by `lastSeenAt` desc).
 */
export function mergePairedAndDiscoveredDevices(
  pairedRecords: readonly SynraPairedDeviceRecord[],
  discoveredPeers: readonly DiscoveredDevice[]
): DisplayDevice[] {
  const pairedIds = new Set(pairedRecords.map((record) => record.deviceId))
  const liveById = new Map(discoveredPeers.map((device) => [device.deviceId, device]))

  const pairedRows: DisplayDevice[] = [...pairedRecords]
    .sort((a, b) => b.pairedAt - a.pairedAt)
    .map((record) => {
      const live = liveById.get(record.deviceId)
      if (live) {
        const liveName = typeof live.name === 'string' ? live.name.trim() : ''
        const storedName = typeof record.displayName === 'string' ? record.displayName.trim() : ''
        return {
          ...live,
          name: liveName.length > 0 ? liveName : storedName,
          isPaired: true,
          pairedAt: record.pairedAt
        }
      }
      const now = Date.now()
      const host = record.lastResolvedHost?.trim() ?? ''
      return {
        deviceId: record.deviceId,
        name: record.displayName,
        ipAddress: host,
        port: host.length > 0 ? record.lastResolvedPort : undefined,
        source: 'probe' as const,
        connectable: false,
        discoveredAt: now,
        lastSeenAt: now,
        isPaired: true,
        pairedAt: record.pairedAt
      }
    })

  const unpaired = discoveredPeers
    .filter((device) => !pairedIds.has(device.deviceId))
    .map(
      (device): DisplayDevice => ({
        ...device,
        isPaired: false
      })
    )
    .sort((left, right) => right.lastSeenAt - left.lastSeenAt)

  return [...pairedRows, ...unpaired]
}
