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
        from: event.from,
        target: event.target,
        eventName: event.event,
        timestamp: event.timestamp
      }),
      requestId: event.requestId,
      event: event.event,
      from: event.from,
      target: event.target,
      replyRequestId: event.replyRequestId,
      payload: event.payload,
      timestamp: event.timestamp
    }

    for (const listener of listeners) {
      if (listener.filter?.requestId && listener.filter.requestId !== normalized.requestId) {
        continue
      }
      if (
        listener.filter?.deviceId &&
        listener.filter.deviceId !== normalized.from &&
        listener.filter.deviceId !== deviceId
      ) {
        continue
      }
      if (listener.filter?.event && listener.filter.event !== normalized.event) {
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
