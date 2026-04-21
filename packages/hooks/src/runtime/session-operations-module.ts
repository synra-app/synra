import { unknownToErrorMessage } from '@synra/protocol'
import type { Ref } from 'vue'
import type { SynraConnectionSendInput, SynraHookEventLog, SynraHookSessionState } from '../types'
import type { ConnectionRuntimeAdapter } from './adapter'
import type { DesktopHandoffState } from './desktop-handoff'
import type { ConnectedSessionsBook } from './connected-sessions-book'
import { resolveMessageEventId } from './message-event-id'

export type ReconnectTask = {
  id: string
  deviceId: string
  host: string
  port: number
  status: 'idle' | 'running' | 'failed' | 'success'
  attempts: number
  updatedAt: number
  error?: string
}

export function createSessionOperationsModule(options: {
  adapter: ConnectionRuntimeAdapter
  isMobileRuntime: boolean
  loading: Ref<boolean>
  error: Ref<string | null>
  sessionState: Ref<SynraHookSessionState>
  reconnectTasks: Ref<ReconnectTask[]>
  reconnectLocks: Set<string>
  handoff: DesktopHandoffState
  sessionsBook: ConnectedSessionsBook
  appendEventLog: (type: SynraHookEventLog['type'], payload: unknown, id?: string) => boolean
}): {
  openSession(options: {
    deviceId: string
    host: string
    port: number
    transport?: 'tcp'
  }): Promise<void>
  closeSession(sessionId?: string): Promise<void>
  syncSessionState(sessionId?: string): Promise<void>
  sendMessage(input: SynraConnectionSendInput): Promise<void>
  reconnectDevice(options: { deviceId: string; host: string; port: number }): Promise<void>
} {
  const {
    adapter,
    isMobileRuntime,
    loading,
    error,
    sessionState,
    reconnectTasks,
    reconnectLocks,
    handoff,
    sessionsBook,
    appendEventLog
  } = options

  let openSessionInFlight = false

  async function openSession(openOptions: {
    deviceId: string
    host: string
    port: number
    transport?: 'tcp'
  }): Promise<void> {
    if (openSessionInFlight) {
      return
    }
    openSessionInFlight = true
    loading.value = true
    try {
      if (!isMobileRuntime && openOptions.host) {
        // On desktop, "connect" means finishing mobile->PC reverse link (chain B).
        // The initial PC->mobile channel (chain A) is only a handoff signal.
        handoff.pendingHandoffHosts.add(openOptions.host)
      }
      await adapter.openSession(openOptions)
      error.value = null
    } catch (unknownError) {
      error.value = unknownToErrorMessage(unknownError, 'Failed to open session.')
      throw unknownError
    } finally {
      openSessionInFlight = false
      loading.value = false
    }
  }

  async function closeSession(sessionId?: string): Promise<void> {
    loading.value = true
    try {
      await adapter.closeSession(sessionId)
      const shouldClearCurrentSession =
        !sessionState.value.sessionId || !sessionId || sessionState.value.sessionId === sessionId
      sessionState.value = {
        ...sessionState.value,
        sessionId: shouldClearCurrentSession ? undefined : sessionState.value.sessionId,
        deviceId: shouldClearCurrentSession ? undefined : sessionState.value.deviceId,
        host: shouldClearCurrentSession ? undefined : sessionState.value.host,
        port: shouldClearCurrentSession ? undefined : sessionState.value.port,
        state: 'closed',
        closedAt: Date.now()
      }
      sessionsBook.markConnectionClosed(sessionId, Date.now())
      error.value = null
    } catch (unknownError) {
      error.value = unknownToErrorMessage(unknownError, 'Failed to close session.')
    } finally {
      loading.value = false
    }
  }

  async function sendMessage(input: SynraConnectionSendInput): Promise<void> {
    loading.value = true
    try {
      appendEventLog(
        'messageSent',
        {
          sessionId: input.sessionId,
          messageId: input.messageId,
          messageType: input.messageType,
          payload: input.payload,
          deviceId: input.deviceId
        },
        resolveMessageEventId({
          type: 'messageSent',
          sessionId: input.sessionId,
          messageId: input.messageId,
          timestamp: Date.now()
        })
      )
      sessionsBook.touchSessionActivity(input.sessionId, Date.now(), 'outbound')
      await adapter.sendMessage({
        sessionId: input.sessionId,
        messageId: input.messageId,
        messageType: input.messageType,
        payload: input.payload
      })
      error.value = null
    } catch (unknownError) {
      error.value = unknownToErrorMessage(unknownError, 'Failed to send message.')
      throw unknownError
    } finally {
      loading.value = false
    }
  }

  async function reconnectDevice(reconnectOptions: {
    deviceId: string
    host: string
    port: number
  }): Promise<void> {
    const taskId = `${reconnectOptions.deviceId}:${reconnectOptions.host}:${reconnectOptions.port}`
    if (reconnectLocks.has(taskId)) {
      return
    }
    reconnectLocks.add(taskId)
    let attempts = 0
    let delayMs = 200
    reconnectTasks.value = [
      {
        id: taskId,
        deviceId: reconnectOptions.deviceId,
        host: reconnectOptions.host,
        port: reconnectOptions.port,
        status: 'running',
        attempts,
        updatedAt: Date.now()
      },
      ...reconnectTasks.value.filter((item) => item.id !== taskId)
    ]
    try {
      while (attempts < 4) {
        attempts += 1
        try {
          await openSession({
            deviceId: reconnectOptions.deviceId,
            host: reconnectOptions.host,
            port: reconnectOptions.port
          })
          reconnectTasks.value = reconnectTasks.value.map((item) =>
            item.id === taskId
              ? { ...item, status: 'success', attempts, updatedAt: Date.now(), error: undefined }
              : item
          )
          return
        } catch (unknownError) {
          const message = unknownToErrorMessage(unknownError, 'Reconnect failed.')
          reconnectTasks.value = reconnectTasks.value.map((item) =>
            item.id === taskId
              ? { ...item, status: 'running', attempts, updatedAt: Date.now(), error: message }
              : item
          )
          await new Promise<void>((resolve) =>
            setTimeout(resolve, delayMs + Math.floor(Math.random() * 100))
          )
          delayMs *= 2
        }
      }
      reconnectTasks.value = reconnectTasks.value.map((item) =>
        item.id === taskId ? { ...item, status: 'failed', attempts, updatedAt: Date.now() } : item
      )
    } finally {
      reconnectLocks.delete(taskId)
    }
  }

  async function syncSessionState(sessionId?: string): Promise<void> {
    try {
      const snapshot = await adapter.getSessionState(sessionId)
      sessionState.value = snapshot
    } catch (unknownError) {
      error.value = unknownToErrorMessage(unknownError, 'Failed to sync session state.')
    }
  }

  return {
    openSession,
    closeSession,
    syncSessionState,
    sendMessage,
    reconnectDevice
  }
}
