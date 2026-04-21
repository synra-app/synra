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
        sessionId: event.sessionId,
        messageId: event.messageId,
        timestamp: event.timestamp
      }),
      sessionId: event.sessionId,
      messageType: event.messageType,
      payload: event.payload,
      messageId: event.messageId,
      timestamp: event.timestamp,
      deviceId
    }

    for (const listener of listeners) {
      if (listener.filter?.sessionId && listener.filter.sessionId !== normalized.sessionId) {
        continue
      }
      if (listener.filter?.deviceId && listener.filter.deviceId !== normalized.deviceId) {
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
