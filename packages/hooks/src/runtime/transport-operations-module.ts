import { unknownToErrorMessage } from '@synra/protocol'
import type { Ref } from 'vue'
import type {
  RuntimeOpenTransportInput,
  RuntimePrimaryTransportState,
  SynraConnectionSendInput,
  SynraLanWireSendInput
} from '../types'
import type { ConnectionRuntimeAdapter } from './adapter'
import type { OpenTransportLinksBook } from './open-transport-links-book'
import { getHooksRuntimeOptions } from './config'
import { setPrimaryTransportStateWithTransitionLog } from './primary-transport-state-transition-log'

const OPEN_TRANSPORT_ERROR_MESSAGE = 'Failed to open transport.'
const CLOSE_TRANSPORT_ERROR_MESSAGE = 'Failed to close transport.'
const SEND_MESSAGE_ERROR_MESSAGE = 'Failed to send message.'
const SEND_LAN_EVENT_ERROR_MESSAGE = 'Failed to send LAN event.'

function isTransportNotOpenFailure(unknownError: unknown): boolean {
  const message = unknownToErrorMessage(unknownError, '')
  if (message.length === 0) {
    return false
  }
  return (
    message.toLowerCase().includes('connection is not open') ||
    message.toLowerCase().includes('transport is not open')
  )
}

export function createTransportOperationsModule(options: {
  adapter: ConnectionRuntimeAdapter
  error: Ref<string | null>
  primaryTransportState: Ref<RuntimePrimaryTransportState>
  openLinksBook: OpenTransportLinksBook
}): {
  openTransport(options: RuntimeOpenTransportInput): Promise<void>
  closeTransport(deviceId?: string): Promise<void>
  sendMessage(input: SynraConnectionSendInput): Promise<void>
  sendLanEvent(input: SynraLanWireSendInput): Promise<void>
} {
  const { adapter, error, primaryTransportState, openLinksBook } = options

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
      const fromHook = hook
        ? await Promise.resolve(hook(openOptions.deviceId)).catch(() => undefined)
        : undefined
      const connectType =
        openOptions.connectType ??
        (fromHook === 'fresh' || fromHook === 'paired' ? fromHook : 'paired')
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
      const shouldClearPrimary =
        !primaryTransportState.value.deviceId ||
        !deviceId ||
        primaryTransportState.value.deviceId === deviceId
      setPrimaryTransportStateWithTransitionLog(
        primaryTransportState,
        {
          ...primaryTransportState.value,
          deviceId: shouldClearPrimary ? undefined : primaryTransportState.value.deviceId,
          host: shouldClearPrimary ? undefined : primaryTransportState.value.host,
          port: shouldClearPrimary ? undefined : primaryTransportState.value.port,
          state: 'closed',
          closedAt: Date.now()
        },
        { reason: 'manual_close_transport' }
      )
      openLinksBook.markTransportDead(deviceId, Date.now())
      error.value = null
    } catch (unknownError) {
      error.value = unknownToErrorMessage(unknownError, CLOSE_TRANSPORT_ERROR_MESSAGE)
    }
  }

  async function sendMessage(input: SynraConnectionSendInput): Promise<void> {
    try {
      openLinksBook.touchLinkActivity(input.targetDeviceId, Date.now(), 'outbound')
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
      if (isTransportNotOpenFailure(unknownError)) {
        const now = Date.now()
        openLinksBook.markTransportDead(input.targetDeviceId, now)
        if (
          !primaryTransportState.value.deviceId ||
          primaryTransportState.value.deviceId === input.targetDeviceId
        ) {
          setPrimaryTransportStateWithTransitionLog(
            primaryTransportState,
            {
              ...primaryTransportState.value,
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
      openLinksBook.touchLinkActivity(input.targetDeviceId, Date.now(), 'outbound')
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
      if (isTransportNotOpenFailure(unknownError)) {
        const now = Date.now()
        openLinksBook.markTransportDead(input.targetDeviceId, now)
        if (
          !primaryTransportState.value.deviceId ||
          primaryTransportState.value.deviceId === input.targetDeviceId
        ) {
          setPrimaryTransportStateWithTransitionLog(
            primaryTransportState,
            {
              ...primaryTransportState.value,
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
