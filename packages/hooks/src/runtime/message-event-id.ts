export function resolveMessageEventId(event: {
  type: string
  requestId?: string
  sourceDeviceId?: string
  targetDeviceId?: string
  messageId?: string
  timestamp?: number
}): string {
  return [
    event.type,
    event.requestId ?? '',
    event.sourceDeviceId ?? '',
    event.targetDeviceId ?? '',
    event.messageId ?? '',
    String(event.timestamp ?? Date.now())
  ].join(':')
}
