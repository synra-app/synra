import { unknownToErrorMessage } from '@synra/protocol'
import type { Ref } from 'vue'
import type {
  RuntimeOpenSessionInput,
  RuntimeSessionState,
  SynraConnectionSendInput
} from '../types'
import type { ConnectionRuntimeAdapter } from './adapter'
import type { DesktopHandoffState } from './desktop-handoff'
import type { ConnectedSessionsBook } from './connected-sessions-book'

const OPEN_SESSION_ERROR_MESSAGE = 'Failed to open session.'
const CLOSE_SESSION_ERROR_MESSAGE = 'Failed to close session.'
const SEND_MESSAGE_ERROR_MESSAGE = 'Failed to send message.'

export function createSessionOperationsModule(options: {
  adapter: ConnectionRuntimeAdapter
  isMobileRuntime: boolean
  loading: Ref<boolean>
  error: Ref<string | null>
  sessionState: Ref<RuntimeSessionState>
  handoff: DesktopHandoffState
  sessionsBook: ConnectedSessionsBook
}): {
  openSession(options: RuntimeOpenSessionInput): Promise<void>
  closeSession(sessionId?: string): Promise<void>
  sendMessage(input: SynraConnectionSendInput): Promise<void>
} {
  const { adapter, isMobileRuntime, loading, error, sessionState, handoff, sessionsBook } = options

  let openSessionInFlight = false

  async function openSession(openOptions: RuntimeOpenSessionInput): Promise<void> {
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
      error.value = unknownToErrorMessage(unknownError, OPEN_SESSION_ERROR_MESSAGE)
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
      error.value = unknownToErrorMessage(unknownError, CLOSE_SESSION_ERROR_MESSAGE)
    } finally {
      loading.value = false
    }
  }

  async function sendMessage(input: SynraConnectionSendInput): Promise<void> {
    loading.value = true
    try {
      sessionsBook.touchSessionActivity(input.sessionId, Date.now(), 'outbound')
      await adapter.sendMessage({
        sessionId: input.sessionId,
        messageId: input.messageId,
        messageType: input.messageType,
        payload: input.payload
      })
      error.value = null
    } catch (unknownError) {
      error.value = unknownToErrorMessage(unknownError, SEND_MESSAGE_ERROR_MESSAGE)
      throw unknownError
    } finally {
      loading.value = false
    }
  }

  return {
    openSession,
    closeSession,
    sendMessage
  }
}
