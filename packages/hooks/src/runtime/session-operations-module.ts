import { unknownToErrorMessage } from '@synra/protocol'
import type { Ref } from 'vue'
import type {
  RuntimeOpenSessionInput,
  RuntimeSessionState,
  SynraConnectionSendInput,
  SynraLanWireSendInput
} from '../types'
import type { ConnectionRuntimeAdapter } from './adapter'
import type { ConnectedSessionsBook } from './connected-sessions-book'
import { getHooksRuntimeOptions } from './config'
import { setSessionStateWithTransitionLog } from './session-state-transition-log'

const OPEN_SESSION_ERROR_MESSAGE = 'Failed to open session.'
const CLOSE_SESSION_ERROR_MESSAGE = 'Failed to close session.'
const SEND_MESSAGE_ERROR_MESSAGE = 'Failed to send message.'
const SEND_LAN_EVENT_ERROR_MESSAGE = 'Failed to send LAN event.'

export function createSessionOperationsModule(options: {
  adapter: ConnectionRuntimeAdapter
  error: Ref<string | null>
  sessionState: Ref<RuntimeSessionState>
  sessionsBook: ConnectedSessionsBook
}): {
  openSession(options: RuntimeOpenSessionInput): Promise<void>
  closeSession(sessionId?: string): Promise<void>
  sendMessage(input: SynraConnectionSendInput): Promise<void>
  sendLanEvent(input: SynraLanWireSendInput): Promise<void>
} {
  const { adapter, error, sessionState, sessionsBook } = options

  const openSessionInflightKeys = new Set<string>()

  function openSessionInflightKey(openOptions: RuntimeOpenSessionInput): string {
    const host = openOptions.host.trim().toLowerCase()
    const port = openOptions.port > 0 ? openOptions.port : 32100
    return `${openOptions.deviceId}:${host}:${port}`
  }

  async function openSession(openOptions: RuntimeOpenSessionInput): Promise<void> {
    const key = openSessionInflightKey(openOptions)
    if (openSessionInflightKeys.has(key)) {
      return
    }
    openSessionInflightKeys.add(key)
    const suppressGlobalError = openOptions.suppressGlobalError === true
    try {
      const hook = getHooksRuntimeOptions().resolveSynraConnectType
      const fromHook = hook ? await Promise.resolve(hook(openOptions.deviceId)) : undefined
      const connectType = openOptions.connectType ?? fromHook
      if (connectType !== 'fresh' && connectType !== 'paired') {
        throw new Error(
          'connectType is required: set RuntimeOpenSessionInput.connectType or configureHooksRuntime({ resolveSynraConnectType }).'
        )
      }
      await adapter.openSession({
        deviceId: openOptions.deviceId,
        host: openOptions.host,
        port: openOptions.port,
        connectType
      })
      error.value = null
    } catch (unknownError) {
      if (!suppressGlobalError) {
        error.value = unknownToErrorMessage(unknownError, OPEN_SESSION_ERROR_MESSAGE)
      }
      throw unknownError
    } finally {
      openSessionInflightKeys.delete(key)
    }
  }

  async function closeSession(sessionId?: string): Promise<void> {
    try {
      await adapter.closeSession(sessionId)
      const shouldClearCurrentSession =
        !sessionState.value.sessionId || !sessionId || sessionState.value.sessionId === sessionId
      setSessionStateWithTransitionLog(
        sessionState,
        {
          ...sessionState.value,
          sessionId: shouldClearCurrentSession ? undefined : sessionState.value.sessionId,
          deviceId: shouldClearCurrentSession ? undefined : sessionState.value.deviceId,
          host: shouldClearCurrentSession ? undefined : sessionState.value.host,
          port: shouldClearCurrentSession ? undefined : sessionState.value.port,
          state: 'closed',
          closedAt: Date.now()
        },
        { reason: 'manual_close_session' }
      )
      sessionsBook.markTransportDead(sessionId, Date.now())
      error.value = null
    } catch (unknownError) {
      error.value = unknownToErrorMessage(unknownError, CLOSE_SESSION_ERROR_MESSAGE)
    }
  }

  async function sendMessage(input: SynraConnectionSendInput): Promise<void> {
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
    }
  }

  async function sendLanEvent(input: SynraLanWireSendInput): Promise<void> {
    try {
      sessionsBook.touchSessionActivity(input.sessionId, Date.now(), 'outbound')
      await adapter.sendLanEvent({
        sessionId: input.sessionId,
        eventName: input.eventName,
        payload: input.payload,
        eventId: input.eventId,
        schemaVersion: input.schemaVersion
      })
      error.value = null
    } catch (unknownError) {
      error.value = unknownToErrorMessage(unknownError, SEND_LAN_EVENT_ERROR_MESSAGE)
      throw unknownError
    }
  }

  return {
    openSession,
    closeSession,
    sendMessage,
    sendLanEvent
  }
}
