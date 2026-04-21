export function resolveErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export function normalizePayloadToText(payload: unknown): string {
  if (typeof payload === 'string') {
    return payload
  }
  if (typeof payload === 'number' || typeof payload === 'boolean') {
    return String(payload)
  }
  if (payload == null) {
    return ''
  }
  try {
    return JSON.stringify(payload)
  } catch {
    return '[unserializable payload]'
  }
}

export function isObjectPayload(payload: unknown): payload is Record<string, unknown> {
  return Boolean(payload) && typeof payload === 'object'
}
