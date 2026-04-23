import type { MessageReceivedEvent } from '@synra/capacitor-device-connection'
import type { SynraConnectionFilter, SynraConnectionMessage } from '../types'
import { resolveMessageEventId } from './message-event-id'

export type RuntimeMessageHandler = {
  filter?: SynraConnectionFilter
  handler: (message: SynraConnectionMessage) => void | Promise<void>
}

export function createMessageListenersRegistry(): MessageListenersRegistry {
  const listeners = new Set<RuntimeMessageHandler>()

  function emitIncomingMessage(event: MessageReceivedEvent, deviceId?: string): void {
    const normalized: SynraConnectionMessage = {
      eventId: resolveMessageEventId({
        type: 'messageReceived',
        requestId: event.requestId,
        sourceDeviceId: event.sourceDeviceId,
        targetDeviceId: event.targetDeviceId,
        messageId: event.messageId,
        timestamp: event.timestamp
      }),
      requestId: event.requestId,
      sourceDeviceId: event.sourceDeviceId,
      targetDeviceId: event.targetDeviceId,
      replyToRequestId: event.replyToRequestId,
      messageType: event.messageType,
      payload: event.payload,
      messageId: event.messageId,
      timestamp: event.timestamp
    }

    for (const listener of listeners) {
      if (listener.filter?.requestId && listener.filter.requestId !== normalized.requestId) {
        continue
      }
      if (
        listener.filter?.deviceId &&
        listener.filter.deviceId !== normalized.sourceDeviceId &&
        listener.filter.deviceId !== deviceId
      ) {
        continue
      }
      if (listener.filter?.messageType && listener.filter.messageType !== normalized.messageType) {
        continue
      }
      void Promise.resolve(listener.handler(normalized))
    }
  }

  function onMessage(
    handler: (message: SynraConnectionMessage) => void | Promise<void>,
    filter?: SynraConnectionFilter
  ): () => void {
    const entry: RuntimeMessageHandler = {
      handler,
      filter
    }
    listeners.add(entry)
    return () => {
      listeners.delete(entry)
    }
  }

  return {
    emitIncomingMessage,
    onMessage,
    listeners
  }
}

export type MessageListenersRegistry = {
  emitIncomingMessage: (event: MessageReceivedEvent, deviceId?: string) => void
  onMessage: (
    handler: (message: SynraConnectionMessage) => void | Promise<void>,
    filter?: SynraConnectionFilter
  ) => () => void
  listeners: Set<RuntimeMessageHandler>
}
