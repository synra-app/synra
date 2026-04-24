import { unknownToErrorMessage } from '@synra/protocol'
import type { Ref } from 'vue'
import type {
  RuntimeOpenTransportInput,
  RuntimeSessionState,
  SynraConnectionSendInput,
  SynraLanWireSendInput
} from '../types'
import type { ConnectionRuntimeAdapter } from './adapter'
import type { ConnectedSessionsBook } from './connected-sessions-book'
import { getHooksRuntimeOptions } from './config'
import { setSessionStateWithTransitionLog } from './session-state-transition-log'

const OPEN_TRANSPORT_ERROR_MESSAGE = 'Failed to open transport.'
const CLOSE_TRANSPORT_ERROR_MESSAGE = 'Failed to close transport.'
const SEND_MESSAGE_ERROR_MESSAGE = 'Failed to send message.'
const SEND_LAN_EVENT_ERROR_MESSAGE = 'Failed to send LAN event.'

function isSessionNotOpenFailure(unknownError: unknown): boolean {
  const message = unknownToErrorMessage(unknownError, '')
  if (message.length === 0) {
    return false
  }
  return (
    message.toLowerCase().includes('session is not open') ||
    message.toLowerCase().includes('transport is not open')
  )
}

export function createSessionOperationsModule(options: {
  adapter: ConnectionRuntimeAdapter
  error: Ref<string | null>
  sessionState: Ref<RuntimeSessionState>
  sessionsBook: ConnectedSessionsBook
}): {
  openTransport(options: RuntimeOpenTransportInput): Promise<void>
  closeTransport(deviceId?: string): Promise<void>
  sendMessage(input: SynraConnectionSendInput): Promise<void>
  sendLanEvent(input: SynraLanWireSendInput): Promise<void>
} {
  const { adapter, error, sessionState, sessionsBook } = options

  const openTransportInflightKeys = new Set<string>()

  function openTransportInflightKey(openOptions: RuntimeOpenTransportInput): string {
    const host = openOptions.host.trim().toLowerCase()
    const port = openOptions.port > 0 ? openOptions.port : 32100
    return `${openOptions.deviceId}:${host}:${port}`
  }

  async function openTransport(openOptions: RuntimeOpenTransportInput): Promise<void> {
    const key = openTransportInflightKey(openOptions)
    if (openTransportInflightKeys.has(key)) {
      return
    }
    openTransportInflightKeys.add(key)
    const suppressGlobalError = openOptions.suppressGlobalError === true
    try {
      const hook = getHooksRuntimeOptions().resolveSynraConnectType
      const fromHook = hook ? await Promise.resolve(hook(openOptions.deviceId)) : undefined
      const connectType = openOptions.connectType ?? fromHook
      if (connectType !== 'fresh' && connectType !== 'paired') {
        throw new Error(
          'connectType is required: set RuntimeOpenTransportInput.connectType or configureHooksRuntime({ resolveSynraConnectType }).'
        )
      }
      await adapter.openTransport({
        deviceId: openOptions.deviceId,
        host: openOptions.host,
        port: openOptions.port,
        connectType
      })
      error.value = null
    } catch (unknownError) {
      if (!suppressGlobalError) {
        error.value = unknownToErrorMessage(unknownError, OPEN_TRANSPORT_ERROR_MESSAGE)
      }
      throw unknownError
    } finally {
      openTransportInflightKeys.delete(key)
    }
  }

  async function closeTransport(deviceId?: string): Promise<void> {
    try {
      await adapter.closeTransport(deviceId)
      const shouldClearCurrentSession =
        !sessionState.value.deviceId || !deviceId || sessionState.value.deviceId === deviceId
      setSessionStateWithTransitionLog(
        sessionState,
        {
          ...sessionState.value,
          deviceId: shouldClearCurrentSession ? undefined : sessionState.value.deviceId,
          host: shouldClearCurrentSession ? undefined : sessionState.value.host,
          port: shouldClearCurrentSession ? undefined : sessionState.value.port,
          state: 'closed',
          closedAt: Date.now()
        },
        { reason: 'manual_close_transport' }
      )
      sessionsBook.markTransportDead(deviceId, Date.now())
      error.value = null
    } catch (unknownError) {
      error.value = unknownToErrorMessage(unknownError, CLOSE_TRANSPORT_ERROR_MESSAGE)
    }
  }

  async function sendMessage(input: SynraConnectionSendInput): Promise<void> {
    try {
      sessionsBook.touchSessionActivity(input.targetDeviceId, Date.now(), 'outbound')
      await adapter.sendMessage({
        requestId: input.requestId,
        sourceDeviceId: input.sourceDeviceId,
        targetDeviceId: input.targetDeviceId,
        replyToRequestId: input.replyToRequestId,
        messageId: input.messageId,
        messageType: input.messageType,
        payload: input.payload
      })
      error.value = null
    } catch (unknownError) {
      if (isSessionNotOpenFailure(unknownError)) {
        const now = Date.now()
        sessionsBook.markTransportDead(input.targetDeviceId, now)
        if (!sessionState.value.deviceId || sessionState.value.deviceId === input.targetDeviceId) {
          setSessionStateWithTransitionLog(
            sessionState,
            {
              ...sessionState.value,
              deviceId: undefined,
              host: undefined,
              port: undefined,
              state: 'closed',
              closedAt: now
            },
            { reason: 'send_message_connection_not_open' }
          )
        }
      }
      error.value = unknownToErrorMessage(unknownError, SEND_MESSAGE_ERROR_MESSAGE)
      throw unknownError
    }
  }

  async function sendLanEvent(input: SynraLanWireSendInput): Promise<void> {
    try {
      sessionsBook.touchSessionActivity(input.targetDeviceId, Date.now(), 'outbound')
      await adapter.sendLanEvent({
        requestId: input.requestId,
        sourceDeviceId: input.sourceDeviceId,
        targetDeviceId: input.targetDeviceId,
        replyToRequestId: input.replyToRequestId,
        eventName: input.eventName,
        payload: input.payload,
        eventId: input.eventId,
        schemaVersion: input.schemaVersion
      })
      error.value = null
    } catch (unknownError) {
      if (isSessionNotOpenFailure(unknownError)) {
        const now = Date.now()
        sessionsBook.markTransportDead(input.targetDeviceId, now)
        if (!sessionState.value.deviceId || sessionState.value.deviceId === input.targetDeviceId) {
          setSessionStateWithTransitionLog(
            sessionState,
            {
              ...sessionState.value,
              deviceId: undefined,
              host: undefined,
              port: undefined,
              state: 'closed',
              closedAt: now
            },
            { reason: 'send_event_connection_not_open' }
          )
        }
      }
      error.value = unknownToErrorMessage(unknownError, SEND_LAN_EVENT_ERROR_MESSAGE)
      throw unknownError
    }
  }

  return {
    openTransport,
    closeTransport,
    sendMessage,
    sendLanEvent
  }
}
