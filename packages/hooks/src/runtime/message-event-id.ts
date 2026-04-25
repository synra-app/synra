export function resolveMessageEventId(event: {
  type: string
  requestId?: string
  from?: string
  target?: string
  eventName?: string
  timestamp?: number
}): string {
  return [
    event.type,
    event.requestId ?? '',
    event.from ?? '',
    event.target ?? '',
    event.eventName ?? '',
    String(event.timestamp ?? Date.now())
  ].join(':')
}
