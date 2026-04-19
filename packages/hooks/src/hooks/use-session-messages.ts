import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import type { SynraHookSendMessageInput } from '../types'
import { getConnectionRuntime, resolveSessionIdFromLogPayload } from '../runtime/core'

export function useSessionMessages(sessionId?: MaybeRefOrGetter<string | null | undefined>) {
  const runtime = getConnectionRuntime()
  const targetSessionId = computed(() => {
    const inputSessionId = sessionId ? toValue(sessionId) : undefined
    return inputSessionId ?? runtime.sessionState.value.sessionId ?? ''
  })

  const sessionLogs = computed(() => {
    if (!targetSessionId.value) {
      return runtime.eventLogs.value
    }
    return runtime.eventLogs.value.filter(
      (log) => resolveSessionIdFromLogPayload(log.payload) === targetSessionId.value
    )
  })

  const canSend = computed(
    () =>
      Boolean(targetSessionId.value) &&
      runtime.connectedSessions.value.some(
        (session) => session.sessionId === targetSessionId.value && session.status === 'open'
      ) &&
      !runtime.loading.value
  )

  async function sendMessage(
    input: Omit<SynraHookSendMessageInput, 'sessionId'> & { sessionId?: string }
  ): Promise<void> {
    const resolvedSessionId = input.sessionId ?? targetSessionId.value
    if (!resolvedSessionId) {
      throw new Error('Cannot send message without an active sessionId.')
    }
    await runtime.sendMessage({
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
