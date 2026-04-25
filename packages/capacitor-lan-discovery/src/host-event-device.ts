import type { DiscoveredDevice } from './definitions'

type HostEventLike = {
  type: string
  remote?: string
  timestamp?: number
  payload?: unknown
}

export type LostDeviceFromHostEvent = {
  deviceId: string
  ipAddress?: string
}

function toDiscoverySource(value: unknown): DiscoveredDevice['source'] {
  return value === 'mdns' || value === 'probe' || value === 'manual' || value === 'transport'
    ? value
    : 'transport'
}

function toPayloadRecord(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
}

function resolveHostFromRemote(remote: string | undefined): string {
  if (typeof remote !== 'string' || remote.trim().length === 0) {
    return ''
  }
  return (remote.split(':')[0] ?? '').trim()
}

export function discoveredDeviceFromHostEvent(
  event: HostEventLike,
  now: number = Date.now()
): DiscoveredDevice | undefined {
  if (event.type !== 'host.member.online' && event.type !== 'transport.opened') {
    return undefined
  }
  const payload = toPayloadRecord(event.payload)
  const deviceId =
    typeof payload.deviceId === 'string' && payload.deviceId.trim().length > 0
      ? payload.deviceId.trim()
      : undefined
  const name =
    typeof payload.displayName === 'string' && payload.displayName.trim().length > 0
      ? payload.displayName.trim()
      : undefined
  const hostFromPayload =
    typeof payload.host === 'string' && payload.host.trim().length > 0
      ? payload.host.trim()
      : undefined
  const fallbackHost = resolveHostFromRemote(event.remote)
  const ipAddress = hostFromPayload ?? fallbackHost
  if (!deviceId || !name || ipAddress.length === 0) {
    return undefined
  }
  const discoveredAt = typeof event.timestamp === 'number' ? event.timestamp : now
  return {
    deviceId,
    name,
    ipAddress,
    port: typeof payload.port === 'number' && payload.port > 0 ? payload.port : undefined,
    source: toDiscoverySource(payload.source),
    connectable: payload.connectable !== false,
    connectCheckAt: discoveredAt,
    discoveredAt,
    lastSeenAt: discoveredAt
  }
}

export function lostDeviceFromHostEvent(event: HostEventLike): LostDeviceFromHostEvent | undefined {
  if (event.type !== 'host.member.offline') {
    return undefined
  }
  const payload = toPayloadRecord(event.payload)
  const deviceId =
    typeof payload.deviceId === 'string' && payload.deviceId.trim().length > 0
      ? payload.deviceId.trim()
      : undefined
  if (!deviceId) {
    return undefined
  }
  return {
    deviceId,
    ipAddress:
      typeof payload.sourceHostIp === 'string' && payload.sourceHostIp.trim().length > 0
        ? payload.sourceHostIp.trim()
        : undefined
  }
}
