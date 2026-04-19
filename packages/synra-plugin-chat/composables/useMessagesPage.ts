import type { ChatSession, SessionLogEntry } from '../src/types/chat'
import { useConnectionState, useDiscovery, useSessionMessages } from '@synra/plugin-sdk/hooks'
import type { SynraHookSendMessageInput } from '@synra/plugin-sdk/hooks'

function resolveErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export function useMessagesPage() {
  const { activeSessions: rawActiveSessions } = useConnectionState()
  const { ensureListeners, loading, error: discoveryError } = useDiscovery()
  const messageInput = ref('')
  const messageType = ref<SynraHookSendMessageInput['messageType']>('custom.chat.text')
  const selectedSessionId = ref<string>('')
  const localError = ref<string | null>(null)

  const activeSessions = computed<ChatSession[]>(() =>
    rawActiveSessions.value.map((session) => ({
      sessionId: session.sessionId,
      deviceId: session.deviceId,
      remote: typeof session.remote === 'string' ? session.remote : undefined,
      direction: typeof session.direction === 'string' ? session.direction : undefined,
      status: typeof session.status === 'string' ? session.status : undefined,
      lastActiveAt:
        typeof session.lastActiveAt === 'number'
          ? new Date(session.lastActiveAt).toLocaleTimeString()
          : undefined
    }))
  )

  const selectedSession = computed(() =>
    activeSessions.value.find((item) => item.sessionId === selectedSessionId.value)
  )

  const {
    sessionLogs: rawSessionLogs,
    canSend: canSendBySession,
    sendMessage
  } = useSessionMessages(selectedSessionId)

  const sessionLogs = computed<SessionLogEntry[]>(() =>
    rawSessionLogs.value.map((log, index) => ({
      id: log.id ?? `${log.timestamp}-${index}`,
      timestamp: log.timestamp,
      type: log.type,
      payload: log.payload
    }))
  )

  const canSend = computed(() => canSendBySession.value && messageInput.value.trim().length > 0)

  const error = computed(() => localError.value ?? discoveryError.value)

  watch(
    activeSessions,
    (sessions) => {
      if (sessions.length === 0) {
        selectedSessionId.value = ''
        return
      }
      if (
        selectedSessionId.value &&
        sessions.some((item) => item.sessionId === selectedSessionId.value)
      ) {
        return
      }
      selectedSessionId.value = sessions[0].sessionId
    },
    { immediate: true }
  )

  function openSession(sessionId: string): void {
    selectedSessionId.value = sessionId
  }

  async function onSendMessage(): Promise<void> {
    if (!canSend.value || !selectedSession.value) {
      return
    }

    const content = messageInput.value.trim()
    messageInput.value = ''
    localError.value = null
    try {
      await sendMessage({
        sessionId: selectedSession.value.sessionId,
        messageType: messageType.value,
        payload: content
      })
    } catch (unknownError) {
      localError.value = resolveErrorMessage(unknownError, 'Failed to send message.')
    }
  }

  onMounted(async () => {
    await ensureListeners()
  })

  return {
    activeSessions,
    canSend,
    error,
    loading,
    messageInput,
    messageType,
    onSendMessage,
    openSession,
    selectedSession,
    selectedSessionId,
    sessionLogs
  }
}
