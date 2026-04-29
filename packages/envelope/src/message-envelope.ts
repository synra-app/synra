import type { LanWireEventName } from '@synra/protocol'

/** Whitelist: same as cross-platform message envelope (no extra fields on the wire). */
export type SynraMessageEnvelope = {
  requestId: string
  event: string
  target: string
  from: string
  replyRequestId?: string
  payload?: unknown
  timestamp?: number
}

/** Inbound frame unified across LAN, TCP connection, or Electron host IPC (TS-only; not on the wire). */
export type SynraInboundEnvelope = {
  kind: 'lan' | 'connection' | 'host'
  envelope: SynraMessageEnvelope
}

/** Payload shape used by the connection `sendMessage` adapter path. */
export type SynraConnectionSendInput = {
  requestId: string
  event: string
  target: string
  from: string
  replyRequestId?: string
  payload: unknown
  timestamp?: number
}

export type SynraLanWireSendInput = {
  requestId: string
  event: LanWireEventName
  target: string
  from: string
  replyRequestId?: string
  payload?: unknown
  timestamp?: number
}

const ENVELOPE_KEYS = new Set([
  'requestId',
  'event',
  'target',
  'from',
  'replyRequestId',
  'payload',
  'timestamp'
])

export function isWhitelistedEnvelopeRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const o = value as Record<string, unknown>
  for (const key of Object.keys(o)) {
    if (!ENVELOPE_KEYS.has(key)) {
      return false
    }
  }
  return (
    typeof o.requestId === 'string' &&
    typeof o.event === 'string' &&
    typeof o.target === 'string' &&
    typeof o.from === 'string' &&
    (o.replyRequestId === undefined || typeof o.replyRequestId === 'string') &&
    (o.timestamp === undefined || typeof o.timestamp === 'number')
  )
}

export function parseSynraMessageEnvelope(value: unknown): SynraMessageEnvelope | null {
  if (!isWhitelistedEnvelopeRecord(value)) {
    return null
  }
  return {
    requestId: value.requestId as string,
    event: value.event as string,
    target: value.target as string,
    from: value.from as string,
    replyRequestId: value.replyRequestId as string | undefined,
    payload: value.payload,
    timestamp: value.timestamp as number | undefined
  }
}

export function normalizeTimestamp(timestamp?: number): number {
  return typeof timestamp === 'number' && Number.isFinite(timestamp) ? timestamp : Date.now()
}

export type NormalizeOutboundInput = {
  event: string
  target: string
  from?: string
  requestId?: string
  replyRequestId?: string
  payload?: unknown
  timestamp?: number
  resolveFrom: () => string
}

/**
 * Fills `requestId`, `from`, `timestamp`; returns send-ready envelope fields.
 * SYNRA-COMM::MESSAGE_ENVELOPE::SEND::SYNRA_ENVELOPE_NORMALIZE
 */
export function normalizePartialOutbound(
  input: NormalizeOutboundInput
): Pick<
  SynraMessageEnvelope,
  'requestId' | 'event' | 'target' | 'from' | 'timestamp' | 'replyRequestId' | 'payload'
> {
  const from = input.from && input.from.trim().length > 0 ? input.from.trim() : input.resolveFrom()
  return {
    requestId:
      input.requestId ?? globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    event: input.event,
    target: input.target,
    from,
    replyRequestId: input.replyRequestId,
    payload: input.payload,
    timestamp: normalizeTimestamp(input.timestamp)
  }
}

export function toConnectionSendInput(base: SynraMessageEnvelope): SynraConnectionSendInput {
  return {
    requestId: base.requestId,
    event: base.event,
    target: base.target,
    from: base.from,
    replyRequestId: base.replyRequestId,
    payload: base.payload === undefined ? null : base.payload,
    timestamp: base.timestamp
  }
}

export function toLanSendInput(base: SynraMessageEnvelope): SynraLanWireSendInput {
  return {
    requestId: base.requestId,
    event: base.event as LanWireEventName,
    target: base.target,
    from: base.from,
    replyRequestId: base.replyRequestId,
    payload: base.payload,
    timestamp: base.timestamp
  }
}
