export function resolveSessionIdFromPayload(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined
  }
  const value = (payload as { sessionId?: unknown }).sessionId
  return typeof value === 'string' ? value : undefined
}
