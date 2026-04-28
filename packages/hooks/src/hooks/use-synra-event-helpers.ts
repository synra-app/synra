import type { SynraEventInbound } from '../synra/synra-envelope'

export const USE_SYNRA_EVENT_DEFAULT_TIMEOUT_MS = 30_000

export type SynraEventOnFilter = {
  requestId?: string
  event?: string
  replyRequestId?: string
  deviceId?: string
}

export function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export function matchesFilter(
  message: SynraEventInbound,
  filter: SynraEventOnFilter | undefined
): boolean {
  if (!filter) {
    return true
  }
  if (filter.requestId !== undefined && filter.requestId !== message.requestId) {
    return false
  }
  if (filter.replyRequestId !== undefined && filter.replyRequestId !== message.replyRequestId) {
    return false
  }
  if (filter.event !== undefined && filter.event !== message.event) {
    return false
  }
  if (filter.deviceId !== undefined) {
    if (filter.deviceId !== message.from && filter.deviceId !== message.target) {
      return false
    }
  }
  return true
}

export type UseSynraEventRequestOptions = {
  timeoutMs?: number
  signal?: AbortSignal
}
