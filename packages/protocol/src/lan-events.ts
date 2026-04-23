/** Wire `LanFrame` type === `event`: payload uses this envelope (JSON). */
export type LanWireEventEnvelope = {
  eventName: LanWireEventName
  /** Event-specific body; validated per handler. */
  payload: unknown
  schemaVersion?: number
  eventId?: string
}

export const LAN_WIRE_EVENT_NAMES = [
  'device.displayName.changed',
  'pairing.request',
  'pairing.response',
  'pairing.peerReset',
  'pairing.unpairRequired'
] as const

export type LanWireEventName = (typeof LAN_WIRE_EVENT_NAMES)[number]

export function isLanWireEventName(value: string): value is LanWireEventName {
  return (LAN_WIRE_EVENT_NAMES as readonly string[]).includes(value)
}

export type LanDeviceDisplayNameChangedPayload = {
  deviceId: string
  displayName: string
}

/** Same shape as frontend `PairRequestPayload` for wire compatibility. */
export type LanPairingRequestPayload = {
  /** Opaque token or nonce for matching response. */
  requestId: string
  sourceDeviceId: string
  targetDeviceId: string
  initiator: {
    deviceId: string
    name: string
    ipAddress: string
    port?: number
    source?: string
    connectable?: boolean
    platform?: string
  }
}

export type LanPairingResponsePayload = {
  requestId: string
  sourceDeviceId: string
  targetDeviceId: string
  replyToRequestId?: string
  accepted: boolean
  reason?: string
}

/** Peer treats us as unpaired (e.g. cleared list); receiver updates local state. */
export type LanPairingPeerResetPayload = {
  fromDeviceId: string
  /** Human-readable; optional. */
  reason?: string
}

/** Ask the receiver to drop local pairing for this session's peer (replaces legacy `custom.pair.unpairRequired`). */
export type LanPairingUnpairRequiredPayload = {
  reason?: string
  mode?: 'fresh' | 'stale'
}
