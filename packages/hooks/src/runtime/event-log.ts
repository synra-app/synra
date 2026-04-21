import { type Ref } from 'vue'
import type { SynraHookEventLog } from '../types'
import { MAX_EVENT_LOGS, MAX_SEEN_EVENT_IDS } from './constants'

export function createEventLogAppender(eventLogs: Ref<SynraHookEventLog[]>): {
  appendEventLog: (type: SynraHookEventLog['type'], payload: unknown, id?: string) => boolean
} {
  const seenEventIds = new Set<string>()

  function appendEventLog(type: SynraHookEventLog['type'], payload: unknown, id?: string): boolean {
    const eventId = id ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
    if (seenEventIds.has(eventId)) {
      return false
    }
    seenEventIds.add(eventId)
    if (seenEventIds.size > MAX_SEEN_EVENT_IDS) {
      const first = seenEventIds.values().next().value
      if (typeof first === 'string') {
        seenEventIds.delete(first)
      }
    }
    eventLogs.value.unshift({
      id: eventId,
      type,
      payload,
      timestamp: Date.now()
    })
    if (eventLogs.value.length > MAX_EVENT_LOGS) {
      eventLogs.value.length = MAX_EVENT_LOGS
    }
    return true
  }

  return { appendEventLog }
}
