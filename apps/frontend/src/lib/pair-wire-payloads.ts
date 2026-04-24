/** LAN `eventName` wire payloads for pairing (not `custom.pair.*` message types). */

export type PairingPeerResetWire = {
  fromDeviceId: string
  reason: string
}

export type PairingResponseWire = {
  requestId: string
  accepted: boolean
  reason?: string
}

function trimNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const t = value.trim()
  return t.length > 0 ? t : undefined
}

/**
 * `pairing.peerReset` — peer cleared pairing locally; payload carries `fromDeviceId`.
 */
export function parsePairingPeerResetPayload(payload: unknown): PairingPeerResetWire | null {
  if (typeof payload !== 'object' || payload === null) {
    return null
  }
  const pl = payload as { fromDeviceId?: unknown; reason?: unknown }
  const fromDeviceId = trimNonEmptyString(pl.fromDeviceId)
  if (!fromDeviceId) {
    return null
  }
  const reason = trimNonEmptyString(pl.reason) ?? 'Peer cleared this pairing.'
  return { fromDeviceId, reason }
}

/**
 * `pairing.response` — accept/decline; `requestId` may live under `replyToRequestId`.
 */
export function parsePairingResponsePayload(payload: unknown): PairingResponseWire | null {
  if (typeof payload !== 'object' || payload === null) {
    return null
  }
  const pl = payload as {
    replyToRequestId?: unknown
    requestId?: unknown
    accepted?: unknown
    reason?: unknown
  }
  const requestId = trimNonEmptyString(pl.replyToRequestId) ?? trimNonEmptyString(pl.requestId)
  const accepted = pl.accepted
  if (!requestId || typeof accepted !== 'boolean') {
    return null
  }
  const reason = trimNonEmptyString(pl.reason)
  return { requestId, accepted, reason }
}

/**
 * `pairing.unpairRequired` — optional human-readable `reason` on payload.
 */
export function parsePairingUnpairRequiredReason(payload: unknown, fallback: string): string {
  if (typeof payload !== 'object' || payload === null) {
    return fallback
  }
  const pl = payload as { reason?: unknown }
  return trimNonEmptyString(pl.reason) ?? fallback
}
