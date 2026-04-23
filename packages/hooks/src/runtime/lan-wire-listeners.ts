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
      sessionId: event.sessionId,
      eventName: event.eventName,
      payload: event.eventPayload,
      fromDeviceId: event.fromDeviceId ?? deviceId,
      transport: event.transport
    }
    for (const listener of listeners) {
      if (listener.filter?.sessionId && listener.filter.sessionId !== normalized.sessionId) {
        continue
      }
      if (listener.filter?.eventName && listener.filter.eventName !== normalized.eventName) {
        continue
      }
      if (listener.filter?.deviceId && listener.filter.deviceId !== normalized.fromDeviceId) {
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
