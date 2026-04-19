import { computed } from 'vue'
import { getConnectionRuntime } from '../runtime/core'

export function useConnectedSessions() {
  const runtime = getConnectionRuntime()
  const activeSessions = computed(() =>
    runtime.connectedSessions.value.filter((session) => session.status === 'open')
  )

  return {
    connectedSessions: runtime.connectedSessions,
    activeSessions
  }
}

export function useConnectionState() {
  const runtime = getConnectionRuntime()
  const { connectedSessions, activeSessions } = useConnectedSessions()

  return {
    connectedSessions,
    activeSessions,
    reconnectTasks: runtime.reconnectTasks,
    sessionState: runtime.sessionState,
    ensureListeners: () => runtime.ensureListeners(),
    openSession: (options: { deviceId: string; host: string; port: number; transport?: 'tcp' }) =>
      runtime.openSession(options),
    reconnectDevice: (options: { deviceId: string; host: string; port: number }) =>
      runtime.reconnectDevice(options),
    closeSession: (sessionId?: string) => runtime.closeSession(sessionId),
    syncSessionState: (sessionId?: string) => runtime.syncSessionState(sessionId)
  }
}
