export function resolveMessageEventId(event: {
  type: string
  sessionId?: string
  messageId?: string
  timestamp?: number
}): string {
  return [
    event.type,
    event.sessionId ?? '',
    event.messageId ?? '',
    String(event.timestamp ?? Date.now())
  ].join(':')
}
