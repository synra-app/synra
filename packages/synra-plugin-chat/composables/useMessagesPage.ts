import type { ChatSession, SessionLogEntry } from '../src/types/chat'

export function useMessagesPage() {
  const loading = ref(false)
  const error = ref<string | null>(null)
  const messageInput = ref('')
  const messageType = ref('custom.chat.text')
  const activeSessions = ref<ChatSession[]>([
    {
      sessionId: 'demo-session',
      deviceId: 'demo-device',
      remote: '127.0.0.1',
      direction: 'outgoing',
      status: 'open',
      lastActiveAt: new Date().toLocaleTimeString()
    }
  ])
  const selectedSessionId = ref<string>(activeSessions.value[0]?.sessionId ?? '')
  const sessionLogs = ref<SessionLogEntry[]>([
    {
      id: 'log-session-opened',
      timestamp: Date.now(),
      type: 'sessionOpened',
      payload: {
        sessionId: selectedSessionId.value
      }
    }
  ])

  const selectedSession = computed(() =>
    activeSessions.value.find((item) => item.sessionId === selectedSessionId.value)
  )

  const canSend = computed(
    () =>
      Boolean(selectedSession.value?.sessionId) &&
      messageInput.value.trim().length > 0 &&
      !loading.value
  )

  function openSession(sessionId: string): void {
    selectedSessionId.value = sessionId
  }

  function onSendMessage(): void {
    if (!canSend.value || !selectedSession.value) {
      return
    }

    const content = messageInput.value.trim()
    messageInput.value = ''
    sessionLogs.value.unshift({
      id: `${Date.now()}`,
      timestamp: Date.now(),
      type: 'messageSent',
      payload: {
        sessionId: selectedSession.value.sessionId,
        messageType: messageType.value,
        content
      }
    })
  }

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
