import {
  DEVICE_DISPLAY_NAME_CHANGED_EVENT,
  DEVICE_PAIRING_PEER_RESET_EVENT,
  DEVICE_PAIRING_REQUEST_EVENT,
  DEVICE_PAIRING_RESPONSE_EVENT,
  DEVICE_PAIRING_UNPAIR_REQUIRED_EVENT
} from './event-names'

/** Wire `LanFrame` type === `event`: payload uses this envelope (JSON). */
export type LanWireEventEnvelope = {
  event: LanWireEventName
  /** Event-specific body; validated per handler. */
  payload: unknown
  schemaVersion?: number
  eventId?: string
}

export const LAN_WIRE_EVENT_NAMES = [
  DEVICE_DISPLAY_NAME_CHANGED_EVENT,
  DEVICE_PAIRING_REQUEST_EVENT,
  DEVICE_PAIRING_RESPONSE_EVENT,
  DEVICE_PAIRING_PEER_RESET_EVENT,
  DEVICE_PAIRING_UNPAIR_REQUIRED_EVENT
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
  from: string
  target: string
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
  from: string
  target: string
  replyRequestId?: string
  accepted: boolean
  reason?: string
}

/** Peer treats us as unpaired (e.g. cleared list); receiver updates local state. */
export type LanPairingPeerResetPayload = {
  from: string
  /** Human-readable; optional. */
  reason?: string
}

/** Ask the receiver to drop local pairing for this active peer link. */
export type LanPairingUnpairRequiredPayload = {
  reason?: string
  mode?: 'fresh' | 'stale'
}
