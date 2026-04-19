import { computed, type Ref } from 'vue'
import type { SessionLogEntry } from '../types/session-log'

function toStringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function getPayloadSessionId(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined
  }

  const candidate = payload as { sessionId?: unknown }
  return toStringValue(candidate.sessionId)
}

type EventLogLike = {
  id?: string
  type: string
  payload: unknown
  timestamp: number
}

const ALLOWED_TYPES: ReadonlyArray<SessionLogEntry['type']> = [
  'sessionOpened',
  'sessionClosed',
  'messageSent',
  'messageReceived',
  'messageAck',
  'transportError'
]

function normalizeLogType(type: string): SessionLogEntry['type'] {
  return ALLOWED_TYPES.includes(type as SessionLogEntry['type'])
    ? (type as SessionLogEntry['type'])
    : 'messageReceived'
}

export function useSessionLogs(
  eventLogs: Readonly<Ref<EventLogLike[]>>,
  selectedSessionId: Ref<string>
) {
  const sessionLogs = computed<SessionLogEntry[]>(() => {
    if (!selectedSessionId.value) {
      return []
    }

    return eventLogs.value
      .filter((entry) => getPayloadSessionId(entry.payload) === selectedSessionId.value)
      .map((entry, index) => ({
        id: entry.id ?? `${entry.timestamp}-${index}`,
        type: normalizeLogType(entry.type),
        payload: entry.payload,
        timestamp: entry.timestamp
      }))
  })

  return {
    sessionLogs
  }
}
