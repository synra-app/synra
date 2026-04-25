/** LAN `event` wire payload parsers for pairing flows. */

export type PairingPeerResetWire = {
  from: string
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
 * `device.pairing.peer-reset` — peer cleared pairing locally; payload carries `from`.
 */
export function parsePairingPeerResetPayload(payload: unknown): PairingPeerResetWire | null {
  if (typeof payload !== 'object' || payload === null) {
    return null
  }
  const pl = payload as { from?: unknown; reason?: unknown }
  const from = trimNonEmptyString(pl.from)
  if (!from) {
    return null
  }
  const reason = trimNonEmptyString(pl.reason) ?? 'Peer cleared this pairing.'
  return { from, reason }
}

/**
 * `device.pairing.response` — accept/decline; `requestId` may live under `replyRequestId`.
 */
export function parsePairingResponsePayload(payload: unknown): PairingResponseWire | null {
  if (typeof payload !== 'object' || payload === null) {
    return null
  }
  const pl = payload as {
    replyRequestId?: unknown
    requestId?: unknown
    accepted?: unknown
    reason?: unknown
  }
  const requestId = trimNonEmptyString(pl.replyRequestId) ?? trimNonEmptyString(pl.requestId)
  const accepted = pl.accepted
  if (!requestId || typeof accepted !== 'boolean') {
    return null
  }
  const reason = trimNonEmptyString(pl.reason)
  return { requestId, accepted, reason }
}

/**
 * `device.pairing.unpair-required` — optional human-readable `reason` on payload.
 */
export function parsePairingUnpairRequiredReason(payload: unknown, fallback: string): string {
  if (typeof payload !== 'object' || payload === null) {
    return fallback
  }
  const pl = payload as { reason?: unknown }
  return trimNonEmptyString(pl.reason) ?? fallback
}
