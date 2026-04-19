import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useSynraHooksAdapter } from './context'
import type { SynraHookEventLog, SynraHookSendMessageInput } from './types'

function resolveSessionIdFromLog(log: SynraHookEventLog): string | undefined {
  if (!log.payload || typeof log.payload !== 'object') {
    return undefined
  }
  const maybeSessionId = (log.payload as { sessionId?: unknown }).sessionId
  return typeof maybeSessionId === 'string' ? maybeSessionId : undefined
}

export function useSessionMessages(sessionId?: MaybeRefOrGetter<string | null | undefined>) {
  const adapter = useSynraHooksAdapter()
  const targetSessionId = computed(() => {
    const inputSessionId = sessionId ? toValue(sessionId) : undefined
    return inputSessionId ?? adapter.sessionState.value.sessionId ?? ''
  })

  const sessionLogs = computed(() => {
    if (!targetSessionId.value) {
      return adapter.eventLogs.value
    }
    return adapter.eventLogs.value.filter(
      (log) => resolveSessionIdFromLog(log) === targetSessionId.value
    )
  })

  const canSend = computed(
    () =>
      Boolean(targetSessionId.value) &&
      adapter.connectedSessions.value.some(
        (session) => session.sessionId === targetSessionId.value && session.status === 'open'
      ) &&
      !adapter.loading.value
  )

  async function sendMessage(
    input: Omit<SynraHookSendMessageInput, 'sessionId'> & { sessionId?: string }
  ): Promise<void> {
    const resolvedSessionId = input.sessionId ?? targetSessionId.value
    if (!resolvedSessionId) {
      throw new Error('Cannot send message without an active sessionId.')
    }
    await adapter.sendMessage({
      ...input,
      sessionId: resolvedSessionId
    })
  }

  return {
    sessionLogs,
    canSend,
    sendMessage
  }
}
