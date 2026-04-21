import type { SynraHookConnectedSession, SynraHookDevice } from '@synra/hooks'

/**
 * Builds the list of open connections shown on the Connect page.
 * Prefers deviceId from the discovery list when host matches, so the same device
 * does not appear under both a temporary id and a stable UUID.
 * Deduplicates by host (or resolved device id) and picks the best session when several exist.
 */
export function buildActiveConnections(
  devices: readonly SynraHookDevice[],
  connectedSessions: readonly SynraHookConnectedSession[]
): SynraHookConnectedSession[] {
  const openSessions = connectedSessions.filter((session) => session.status === 'open')
  const byDeviceKey = new Map<string, SynraHookConnectedSession>()

  for (const session of openSessions) {
    const host = typeof session.host === 'string' ? session.host : undefined
    const port = typeof session.port === 'number' ? session.port : undefined
    const hasEndpoint = Boolean(host && Number.isFinite(port))
    const declaredDeviceId =
      typeof session.deviceId === 'string' && session.deviceId.length > 0
        ? session.deviceId
        : undefined
    const matchedDevice = host ? devices.find((device) => device.ipAddress === host) : undefined
    const resolvedDeviceId = matchedDevice?.deviceId ?? declaredDeviceId

    // Only show sessions that identify a peer device; drop probe/handshake-only rows.
    if (!resolvedDeviceId || !hasEndpoint) {
      continue
    }

    const normalizedSession: SynraHookConnectedSession = {
      ...session,
      deviceId: resolvedDeviceId
    }
    const key = host ?? resolvedDeviceId
    const existing = byDeviceKey.get(key)
    if (!existing) {
      byDeviceKey.set(key, normalizedSession)
      continue
    }

    const existingActiveAt = typeof existing.lastActiveAt === 'number' ? existing.lastActiveAt : 0
    const nextActiveAt =
      typeof normalizedSession.lastActiveAt === 'number' ? normalizedSession.lastActiveAt : 0
    const existingDirection =
      (existing as { direction?: unknown }).direction === 'outbound' ? 'outbound' : 'inbound'
    const nextDirection =
      (normalizedSession as { direction?: unknown }).direction === 'outbound'
        ? 'outbound'
        : 'inbound'

    const existingOutbound = existingDirection === 'outbound'
    const nextOutbound = nextDirection === 'outbound'
    if (nextOutbound && !existingOutbound) {
      byDeviceKey.set(key, normalizedSession)
      continue
    }
    if (nextActiveAt >= existingActiveAt) {
      byDeviceKey.set(key, normalizedSession)
    }
  }

  return [...byDeviceKey.values()].sort((left, right) => {
    const leftActiveAt = typeof left.lastActiveAt === 'number' ? left.lastActiveAt : 0
    const rightActiveAt = typeof right.lastActiveAt === 'number' ? right.lastActiveAt : 0
    return rightActiveAt - leftActiveAt
  })
}
