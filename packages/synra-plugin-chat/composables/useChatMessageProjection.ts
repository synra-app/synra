import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'
import type { ChatMessage, SessionLogEntry } from '../src/types/chat'
import { isObjectPayload, normalizePayloadToText } from './chatPayload'

export function useChatMessageProjection(options: {
  selectedSessionId: Ref<string>
  sessionLogs: ComputedRef<SessionLogEntry[]>
}): {
  messageEvents: ComputedRef<SessionLogEntry[]>
  messages: ComputedRef<ChatMessage[]>
  failedMessageIds: Ref<Set<string>>
  pendingMessages: Ref<ChatMessage[]>
} {
  const { selectedSessionId, sessionLogs } = options
  const failedMessageIds = ref<Set<string>>(new Set())
  const pendingMessages = ref<ChatMessage[]>([])

  const messageEvents = computed(() =>
    [...sessionLogs.value].sort((left, right) => left.timestamp - right.timestamp)
  )

  const messages = computed<ChatMessage[]>(() => {
    const mapped: ChatMessage[] = []
    const messageIndexById = new Map<string, number>()

    for (const entry of messageEvents.value) {
      if (entry.type === 'messageSent') {
        const payload = isObjectPayload(entry.payload) ? entry.payload : undefined
        const messageId = typeof payload?.messageId === 'string' ? payload.messageId : undefined
        const sessionId =
          typeof payload?.sessionId === 'string' ? payload.sessionId : selectedSessionId.value
        const text = normalizePayloadToText(payload?.payload)
        const status = messageId && failedMessageIds.value.has(messageId) ? 'failed' : 'sent'
        mapped.push({
          id: entry.id,
          sessionId,
          messageId,
          direction: 'outgoing',
          text,
          messageType: typeof payload?.messageType === 'string' ? payload.messageType : undefined,
          timestamp: entry.timestamp,
          timeLabel: new Date(entry.timestamp).toLocaleTimeString(),
          status
        })
        if (messageId) {
          messageIndexById.set(messageId, mapped.length - 1)
        }
        continue
      }

      if (entry.type === 'messageReceived') {
        const payload = isObjectPayload(entry.payload) ? entry.payload : undefined
        mapped.push({
          id: entry.id,
          sessionId:
            typeof payload?.sessionId === 'string' ? payload.sessionId : selectedSessionId.value,
          messageId: typeof payload?.messageId === 'string' ? payload.messageId : undefined,
          direction: 'incoming',
          text: normalizePayloadToText(payload?.payload),
          messageType: typeof payload?.messageType === 'string' ? payload.messageType : undefined,
          timestamp: entry.timestamp,
          timeLabel: new Date(entry.timestamp).toLocaleTimeString(),
          status: 'received'
        })
        continue
      }

      if (entry.type === 'messageAck') {
        const payload = isObjectPayload(entry.payload) ? entry.payload : undefined
        const messageId = typeof payload?.messageId === 'string' ? payload.messageId : undefined
        if (messageId && messageIndexById.has(messageId)) {
          const targetIndex = messageIndexById.get(messageId)
          if (typeof targetIndex === 'number') {
            mapped[targetIndex] = {
              ...mapped[targetIndex],
              status: 'acked'
            }
          }
          continue
        }
      }

      if (entry.type === 'transportError') {
        const payload = isObjectPayload(entry.payload) ? entry.payload : undefined
        mapped.push({
          id: entry.id,
          direction: 'system',
          text:
            typeof payload?.message === 'string' ? payload.message : 'Transport error occurred.',
          timestamp: entry.timestamp,
          timeLabel: new Date(entry.timestamp).toLocaleTimeString(),
          status: 'system'
        })
      }
    }

    for (const pending of pendingMessages.value) {
      mapped.push(pending)
    }

    return mapped.sort((left, right) => left.timestamp - right.timestamp)
  })

  watch(messageEvents, (entries) => {
    if (entries.length === 0 || pendingMessages.value.length === 0) {
      return
    }
    const sentMessageIds = new Set<string>()
    for (const entry of entries) {
      if (entry.type !== 'messageSent') {
        continue
      }
      const payload = isObjectPayload(entry.payload) ? entry.payload : undefined
      if (typeof payload?.messageId === 'string' && payload.messageId.length > 0) {
        sentMessageIds.add(payload.messageId)
      }
    }
    pendingMessages.value = pendingMessages.value.filter((message) => {
      if (!message.messageId) {
        return false
      }
      return !sentMessageIds.has(message.messageId)
    })
  })

  return {
    messageEvents,
    messages,
    failedMessageIds,
    pendingMessages
  }
}
