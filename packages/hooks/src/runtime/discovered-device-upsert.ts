import type { DiscoveredDevice } from '@synra/capacitor-lan-discovery'
import type { Ref } from 'vue'
import { normalizeHost } from './host-normalization'
import { sortDevices } from './device-sort'

type SessionOpenedLike = {
  deviceId?: string
  host?: string
  displayName?: string
  port?: number
}

function nonEmptyTrimmed(value: string | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function isPlaceholderName(value: string | undefined): boolean {
  if (typeof value !== 'string') {
    return false
  }
  const normalized = value.trim().toLowerCase()
  return normalized.startsWith('peer ')
}

function pickPreferredName(
  existingName: string | undefined,
  incomingName: string | undefined
): string {
  const existing = nonEmptyTrimmed(existingName)
  const incoming = nonEmptyTrimmed(incomingName)
  if (incoming && !isPlaceholderName(incoming)) {
    return incoming
  }
  if (existing && !isPlaceholderName(existing)) {
    return existing
  }
  return incoming ?? existing ?? 'Unknown Device'
}

function resolveValidPort(
  eventPort: number | undefined,
  fallbackPort: number | undefined
): number | undefined {
  if (typeof eventPort === 'number' && eventPort > 0) {
    return eventPort
  }
  return fallbackPort
}

export function upsertDiscoveredPeerFromSession(
  devices: Ref<DiscoveredDevice[]>,
  event: SessionOpenedLike
): void {
  if (typeof event.deviceId !== 'string' || event.deviceId.length === 0) {
    return
  }
  if (typeof event.host !== 'string' || event.host.length === 0) {
    return
  }
  const host = normalizeHost(event.host)
  if (host.length === 0) {
    return
  }
  const now = Date.now()
  const existing =
    devices.value.find((device) => device.deviceId === event.deviceId) ??
    devices.value.find((device) => normalizeHost(device.ipAddress) === host)
  const displayName = nonEmptyTrimmed(event.displayName) ?? nonEmptyTrimmed(existing?.name)
  if (!displayName) {
    return
  }
  const port = resolveValidPort(event.port, existing?.port)
  const peer: DiscoveredDevice = existing
    ? {
        ...existing,
        deviceId: event.deviceId,
        name: displayName,
        ipAddress: existing.ipAddress || host,
        port,
        source: existing.source,
        connectable: true,
        connectCheckAt: now,
        lastSeenAt: now
      }
    : {
        deviceId: event.deviceId,
        name: displayName,
        ipAddress: host,
        port,
        source: 'session',
        connectable: true,
        connectCheckAt: now,
        discoveredAt: now,
        lastSeenAt: now
      }
  const others = devices.value.filter((device) => {
    if (device.deviceId === peer.deviceId) {
      return false
    }
    return normalizeHost(device.ipAddress) !== host
  })
  devices.value = sortDevices([...others, peer])
}

export function upsertDiscoveredDevice(
  devices: Ref<DiscoveredDevice[]>,
  incoming: DiscoveredDevice
): void {
  const host = normalizeHost(incoming.ipAddress)
  const existing =
    devices.value.find((device) => device.deviceId === incoming.deviceId) ??
    devices.value.find((device) => normalizeHost(device.ipAddress) === host)

  if (!existing) {
    devices.value = sortDevices([...devices.value, incoming])
    return
  }

  const merged: DiscoveredDevice = {
    ...existing,
    ...incoming,
    deviceId: existing.connectable && !incoming.connectable ? existing.deviceId : incoming.deviceId,
    name: pickPreferredName(existing.name, incoming.name),
    connectable: Boolean(existing.connectable || incoming.connectable),
    source:
      existing.connectable && !incoming.connectable
        ? existing.source
        : (incoming.source ?? existing.source),
    connectCheckError:
      existing.connectable && !incoming.connectable
        ? existing.connectCheckError
        : (incoming.connectCheckError ?? undefined),
    connectCheckAt:
      Math.max(existing.connectCheckAt ?? 0, incoming.connectCheckAt ?? 0) || undefined,
    discoveredAt: existing.discoveredAt ?? incoming.discoveredAt ?? Date.now(),
    lastSeenAt: Math.max(existing.lastSeenAt ?? 0, incoming.lastSeenAt ?? 0) || Date.now()
  }
  const others = devices.value.filter((device) => {
    if (device.deviceId === merged.deviceId) {
      return false
    }
    return normalizeHost(device.ipAddress) !== normalizeHost(merged.ipAddress)
  })
  devices.value = sortDevices([...others, merged])
}
