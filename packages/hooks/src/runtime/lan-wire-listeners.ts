import type { LanWireEventReceivedEvent } from '@synra/capacitor-device-connection'
import type { SynraLanWireEvent, SynraLanWireFilter } from '../types'

export type RuntimeLanWireHandler = {
  filter?: SynraLanWireFilter
  handler: (event: SynraLanWireEvent) => void | Promise<void>
}

export type LanWireListenersRegistry = {
  emitLanWireEvent: (event: LanWireEventReceivedEvent, deviceId?: string) => void
  onLanWireEvent: (
    handler: (event: SynraLanWireEvent) => void | Promise<void>,
    filter?: SynraLanWireFilter
  ) => () => void
}

export function createLanWireListenersRegistry(): LanWireListenersRegistry {
  const listeners = new Set<RuntimeLanWireHandler>()

  function emitLanWireEvent(event: LanWireEventReceivedEvent, deviceId?: string): void {
    const normalized: SynraLanWireEvent = {
      requestId: event.requestId,
      sourceDeviceId: event.sourceDeviceId,
      targetDeviceId: event.targetDeviceId,
      replyToRequestId: event.replyToRequestId,
      eventName: event.eventName,
      payload: event.eventPayload,
      transport: event.transport
    }
    for (const listener of listeners) {
      if (listener.filter?.requestId && listener.filter.requestId !== normalized.requestId) {
        continue
      }
      if (listener.filter?.eventName && listener.filter.eventName !== normalized.eventName) {
        continue
      }
      if (
        listener.filter?.deviceId &&
        listener.filter.deviceId !== normalized.sourceDeviceId &&
        listener.filter.deviceId !== deviceId
      ) {
        continue
      }
      void Promise.resolve(listener.handler(normalized))
    }
  }

  function onLanWireEvent(
    handler: (event: SynraLanWireEvent) => void | Promise<void>,
    filter?: SynraLanWireFilter
  ): () => void {
    const entry: RuntimeLanWireHandler = { handler, filter }
    listeners.add(entry)
    return () => {
      listeners.delete(entry)
    }
  }

  return { emitLanWireEvent, onLanWireEvent }
}
