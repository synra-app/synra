import type { DiscoveredDevice } from '@synra/capacitor-lan-discovery'
import type { SynraPairedDeviceRecord } from '@synra/capacitor-preferences'
import type { RuntimeOpenTransportLink } from '../types'
import { normalizeHost, normalizeHostKey } from './host-normalization'

export type DisplayDevice = DiscoveredDevice & {
  isPaired: boolean
  pairedAt?: number
}

const DEFAULT_LAN_PORT = 32100

function discoveredPort(device: DiscoveredDevice): number {
  if (typeof device.port === 'number' && device.port > 0) {
    return device.port
  }
  return DEFAULT_LAN_PORT
}

function buildLiveByHostKey(devices: readonly DiscoveredDevice[]): Map<string, DiscoveredDevice> {
  const map = new Map<string, DiscoveredDevice>()
  for (const device of devices) {
    const key = normalizeHostKey(device.ipAddress, discoveredPort(device))
    if (key.length === 0) {
      continue
    }
    const existing = map.get(key)
    if (!existing) {
      map.set(key, device)
      continue
    }
    if (device.connectable && !existing.connectable) {
      map.set(key, device)
      continue
    }
    if (device.lastSeenAt > existing.lastSeenAt) {
      map.set(key, device)
    }
  }
  return map
}

function openLinkAddressForDevice(
  deviceId: string,
  openTransportLinks: readonly RuntimeOpenTransportLink[]
): { host: string; port: number } | undefined {
  for (const link of openTransportLinks) {
    if (link.transport !== 'ready') {
      continue
    }
    if (link.deviceId !== deviceId) {
      continue
    }
    const host = normalizeHost(link.host)
    if (host.length === 0) {
      continue
    }
    return {
      host,
      port: typeof link.port === 'number' && link.port > 0 ? link.port : DEFAULT_LAN_PORT
    }
  }
  return undefined
}

/**
 * Paired rows first (by `pairedAt` desc), then unpaired discovery rows (by `lastSeenAt` desc).
 * Paired list content comes from `pairedRecords` and transport readiness, not from overlaying
 * the latest `discoveredPeers` row (avoids scan-driven churn for the same device).
 * When `lastResolvedHost` is missing in storage, IP/port fall back to the open TCP link.
 */
export function mergePairedAndDiscoveredDevices(
  pairedRecords: readonly SynraPairedDeviceRecord[],
  discoveredPeers: readonly DiscoveredDevice[],
  transportReadyDeviceIds: ReadonlySet<string>,
  openTransportLinks: readonly RuntimeOpenTransportLink[]
): DisplayDevice[] {
  const pairedIds = new Set(pairedRecords.map((record) => record.deviceId))
  const liveById = new Map(discoveredPeers.map((device) => [device.deviceId, device]))
  const liveByHostKey = buildLiveByHostKey(discoveredPeers)
  const consumedDiscoveredIds = new Set<string>()

  const pairedRows: DisplayDevice[] = [...pairedRecords]
    .sort((a, b) => b.pairedAt - a.pairedAt)
    .map((record) => {
      if (!liveById.get(record.deviceId)) {
        const key = normalizeHostKey(
          record.lastResolvedHost,
          record.lastResolvedPort ?? DEFAULT_LAN_PORT
        )
        if (key.length > 0) {
          const byHost = liveByHostKey.get(key)
          if (byHost && byHost.deviceId !== record.deviceId) {
            consumedDiscoveredIds.add(byHost.deviceId)
          }
        }
      }
      const name =
        typeof record.displayName === 'string' && record.displayName.trim().length > 0
          ? record.displayName.trim()
          : record.deviceId
      const fromLink = openLinkAddressForDevice(record.deviceId, openTransportLinks)
      const storedHost = record.lastResolvedHost?.trim() ?? ''
      let host: string
      let port: number | undefined
      if (storedHost.length > 0) {
        host = storedHost
        port =
          typeof record.lastResolvedPort === 'number' && record.lastResolvedPort > 0
            ? record.lastResolvedPort
            : (fromLink?.port ?? DEFAULT_LAN_PORT)
      } else if (fromLink) {
        host = fromLink.host
        port = fromLink.port
      } else {
        host = ''
        port = undefined
      }
      const hasTcp = transportReadyDeviceIds.has(record.deviceId)
      const now = Date.now()
      return {
        deviceId: record.deviceId,
        name,
        ipAddress: host,
        port,
        source: 'probe' as const,
        connectable: hasTcp,
        connectCheckAt: hasTcp ? now : undefined,
        discoveredAt: record.pairedAt,
        lastSeenAt: hasTcp ? now : record.pairedAt,
        isPaired: true,
        pairedAt: record.pairedAt
      } satisfies DisplayDevice
    })

  const unpaired = discoveredPeers
    .filter(
      (device) => !pairedIds.has(device.deviceId) && !consumedDiscoveredIds.has(device.deviceId)
    )
    .map(
      (device): DisplayDevice => ({
        ...device,
        isPaired: false
      })
    )
    .sort((left, right) => right.lastSeenAt - left.lastSeenAt)

  return [...pairedRows, ...unpaired]
}
