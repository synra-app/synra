import type { DiscoveredDevice } from '@synra/capacitor-lan-discovery'
import type { RuntimeOpenTransportLink } from '../types'
import { sortDevices } from './device-sort'
import { normalizeHost } from './host-normalization'

function effectivePort(port: number | undefined, fallbackPort: number): number {
  if (typeof port === 'number' && port > 0) {
    return port
  }
  return fallbackPort
}

export function hasReadyOpenLinkForScanRow(
  row: DiscoveredDevice,
  links: readonly RuntimeOpenTransportLink[],
  synraDefaultPort: number
): boolean {
  for (const link of links) {
    if (link.transport !== 'ready') {
      continue
    }
    if (
      typeof link.deviceId === 'string' &&
      link.deviceId.length > 0 &&
      link.deviceId === row.deviceId
    ) {
      return true
    }
    const linkHost = normalizeHost(link.host)
    const rowHost = normalizeHost(row.ipAddress)
    if (linkHost.length > 0 && linkHost === rowHost) {
      const lp = effectivePort(link.port, synraDefaultPort)
      const rp = effectivePort(row.port, synraDefaultPort)
      if (lp === rp) {
        return true
      }
    }
  }
  return false
}

/**
 * Merges existing TCP long-lived links into the discovery list so a full
 * `startDiscovery` refresh does not drop peers that are only present via
 * `transport` events, and so we do not re-probe hosts that are already in use.
 */
export function mergeReadyLinksIntoDiscovered(
  rows: DiscoveredDevice[],
  links: readonly RuntimeOpenTransportLink[],
  synraDefaultPort: number
): DiscoveredDevice[] {
  const now = Date.now()
  const byId = new Map<string, DiscoveredDevice>()
  for (const row of rows) {
    byId.set(row.deviceId, row)
  }
  for (const link of links) {
    if (link.transport !== 'ready') {
      continue
    }
    const id = link.deviceId?.trim()
    if (!id) {
      continue
    }
    const host = normalizeHost(link.host ?? '')
    if (host.length === 0) {
      continue
    }
    const port = effectivePort(link.port, synraDefaultPort)
    const existing = byId.get(id)
    const connectCheck = link.lastActiveAt ?? link.openedAt ?? now
    const nameFromExisting =
      existing && typeof existing.name === 'string' && existing.name.trim().length > 0
        ? existing.name.trim()
        : id
    byId.set(id, {
      ...(existing ?? {
        deviceId: id,
        name: nameFromExisting,
        ipAddress: host,
        port,
        source: 'transport' as const,
        discoveredAt: now
      }),
      deviceId: id,
      name: nameFromExisting,
      ipAddress: host,
      port,
      source: 'transport' as const,
      connectable: true,
      connectCheckAt: connectCheck,
      connectCheckError: undefined,
      lastSeenAt: now,
      discoveredAt: existing?.discoveredAt ?? now
    })
  }
  return sortDevices([...byId.values()])
}
