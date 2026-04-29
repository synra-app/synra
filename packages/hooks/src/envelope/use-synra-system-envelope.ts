import type { SynraInboundEnvelope, SynraMessageEnvelope } from '@synra/envelope'
import { toLogicalFromSystemWireEvent, toSystemWireEvent } from '@synra/envelope'
import {
  matchesFilter,
  type SynraInboundFilter,
  type UseSynraEnvelopeRequestOptions
} from './use-synra-envelope-helpers'
import { useSynraEnvelope } from './use-synra-envelope'

export type { SynraInboundEnvelope, SynraMessageEnvelope } from '@synra/envelope'
export type { SynraEnvelopeRuntimeSurface } from '@synra/envelope'
export type { SynraInboundFilter, UseSynraEnvelopeRequestOptions }

function mapSystemInbound(m: SynraInboundEnvelope): SynraInboundEnvelope {
  return {
    ...m,
    event: toLogicalFromSystemWireEvent(m.event)
  }
}

/**
 * System / app envelope helper: `send({ event: 'device.pairing.request' })` is sent on the wire as
 * `_synra.device.pairing.request` via `useSynraEnvelope`. Inbound delivers **logical** `event` (prefix stripped when present).
 * Thin layer over `useSynraEnvelope`; same pattern as `useSynraPluginEnvelope` with a `_plugin.{slug}.` prefix.
 * SYNRA-COMM::MESSAGE_ENVELOPE::SEND::USE_SYNRA_SYSTEM_ENVELOPE_POST
 */
export function useSynraSystemEnvelope() {
  const ev = useSynraEnvelope()

  async function send(
    partial: Partial<SynraMessageEnvelope> & Pick<SynraMessageEnvelope, 'event' | 'target'>
  ): Promise<SynraMessageEnvelope> {
    const out = await ev.send({
      ...partial,
      event: toSystemWireEvent(partial.event)
    } as Parameters<ReturnType<typeof useSynraEnvelope>['send']>[0])
    return { ...out, event: toLogicalFromSystemWireEvent(out.event) }
  }

  function subscribe(
    handler: (message: SynraInboundEnvelope) => void | Promise<void>,
    filter?: SynraInboundFilter
  ): () => void {
    return ev.subscribe((m) => {
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
    options?: UseSynraEnvelopeRequestOptions
  ): Promise<SynraInboundEnvelope> {
    return ev
      .request({ ...partial, event: toSystemWireEvent(partial.event) } as never, options)
      .then((m) => mapSystemInbound(m))
  }

  return {
    getRuntimeSurface: () => ev.getRuntimeSurface(),
    send,
    subscribe,
    request
  }
}
