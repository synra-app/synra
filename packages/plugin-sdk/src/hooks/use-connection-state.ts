import { computed } from 'vue'
import { useSynraHooksAdapter } from './context'

export function useConnectedSessions() {
  const adapter = useSynraHooksAdapter()
  const activeSessions = computed(() =>
    adapter.connectedSessions.value.filter((session) => session.status === 'open')
  )

  return {
    connectedSessions: adapter.connectedSessions,
    activeSessions
  }
}

export function useConnectionState() {
  const adapter = useSynraHooksAdapter()
  const { connectedSessions, activeSessions } = useConnectedSessions()

  return {
    connectedSessions,
    activeSessions,
    sessionState: adapter.sessionState,
    openSession: (options: { deviceId: string; host: string; port: number }) =>
      adapter.openSession(options),
    closeSession: (sessionId?: string) => adapter.closeSession(sessionId),
    syncSessionState: (sessionId?: string) => adapter.syncSessionState(sessionId)
  }
}
