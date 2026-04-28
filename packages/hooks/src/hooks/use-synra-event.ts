import type { SynraEventInbound, SynraMessageEnvelope } from '../synra/synra-envelope'
import { toLogicalFromSystemWireEvent, toSystemWireEvent } from '../synra/synra-event-prefix'
import { useEvent } from './use-event'
import {
  matchesFilter,
  type SynraEventOnFilter,
  type UseSynraEventRequestOptions
} from './use-synra-event-helpers'

export type { SynraEventInbound, SynraMessageEnvelope } from '../synra/synra-envelope'
export type { SynraEventRuntimeSurface } from '../synra/synra-event-surface'
export type { SynraEventOnFilter, UseSynraEventRequestOptions }

function mapSystemInbound(m: SynraEventInbound): SynraEventInbound {
  return {
    ...m,
    event: toLogicalFromSystemWireEvent(m.event)
  }
}

/**
 * System / app event helper: `postMessage({ event: 'device.pairing.request' })` is sent on the wire as
 * `_system.device.pairing.request` via `useEvent`. Inbound delivers **logical** `event` (prefix stripped when present).
 * This is a thin layer over `useEvent`; the same pattern applies to `useSynraPluginEvent` with a `_plugin.{slug}.` prefix.
 * SYNRA-COMM::MESSAGE_ENVELOPE::SEND::USE_SYNRA_EVENT_POST
 */
export function useSynraEvent() {
  const ev = useEvent()

  async function postMessage(
    partial: Partial<SynraMessageEnvelope> & Pick<SynraMessageEnvelope, 'event' | 'target'>
  ): Promise<SynraMessageEnvelope> {
    const out = await ev.postMessage({
      ...partial,
      event: toSystemWireEvent(partial.event)
    } as Parameters<ReturnType<typeof useEvent>['postMessage']>[0])
    return { ...out, event: toLogicalFromSystemWireEvent(out.event) }
  }

  function onMessage(
    handler: (message: SynraEventInbound) => void | Promise<void>,
    filter?: SynraEventOnFilter
  ): () => void {
    return ev.onMessage((m) => {
      const logical = mapSystemInbound(m)
      if (!matchesFilter(logical, filter)) {
        return
      }
      void Promise.resolve(handler(logical))
    })
  }

  function request(
    partial: Partial<SynraMessageEnvelope> &
      Pick<SynraMessageEnvelope, 'event' | 'target' | 'payload'>,
    options?: UseSynraEventRequestOptions
  ): Promise<SynraEventInbound> {
    return ev
      .request({ ...partial, event: toSystemWireEvent(partial.event) } as never, options)
      .then((m) => mapSystemInbound(m))
  }

  return {
    getRuntimeSurface: () => ev.getRuntimeSurface(),
    postMessage,
    onMessage,
    request
  }
}
