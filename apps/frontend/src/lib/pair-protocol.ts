import type { SynraMessageType } from '@synra/protocol'

export const PAIR_MESSAGE_REQUEST = 'custom.pair.request' as SynraMessageType
export const PAIR_MESSAGE_ACCEPT = 'custom.pair.accept' as SynraMessageType
export const PAIR_MESSAGE_REJECT = 'custom.pair.reject' as SynraMessageType

export type PairInitiatorProfile = {
  deviceId: string
  name: string
  ipAddress: string
  port?: number
  source?: string
  connectable: boolean
  platform?: string
}

export type PairRequestPayload = {
  requestId: string
  initiator: PairInitiatorProfile
}

export type PairDecisionPayload = {
  requestId: string
  reason?: string
}

export function isPairRequestPayload(value: unknown): value is PairRequestPayload {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const record = value as Record<string, unknown>
  const requestId = record.requestId
  const initiator = record.initiator
  if (typeof requestId !== 'string' || requestId.trim().length === 0) {
    return false
  }
  if (typeof initiator !== 'object' || initiator === null) {
    return false
  }
  const ini = initiator as Record<string, unknown>
  return (
    typeof ini.deviceId === 'string' &&
    ini.deviceId.trim().length > 0 &&
    typeof ini.name === 'string' &&
    typeof ini.ipAddress === 'string'
  )
}

export function isPairDecisionPayload(value: unknown): value is PairDecisionPayload {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const requestId = (value as { requestId?: unknown }).requestId
  return typeof requestId === 'string' && requestId.trim().length > 0
}
