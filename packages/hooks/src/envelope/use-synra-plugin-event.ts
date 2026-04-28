import type { SynraInboundEnvelope, SynraMessageEnvelope } from '@synra/envelope'
import {
  normalizePluginPackageNameToWireSlug,
  toLogicalFromPluginWireEvent,
  toPluginWireEvent
} from '@synra/envelope'
import {
  matchesFilter,
  type SynraInboundFilter,
  type UseSynraEnvelopeRequestOptions
} from './use-synra-envelope-helpers'
import { useSynraEnvelope } from './use-synra-envelope'

export type { SynraInboundEnvelope, SynraMessageEnvelope } from '@synra/envelope'
export type { SynraEnvelopeRuntimeSurface } from '@synra/envelope'
export type { SynraInboundFilter, UseSynraEnvelopeRequestOptions }

/**
 * Plugin event helper: same as `useSynraEvent` but with `_plugin.{pluginSlug}.{logicalEvent}` on the wire
 * (e.g. package `@synra-plugin/chat` + `send({ event: 'send' })` → `_plugin.chat.send`).
 * Inbound `event` in the callback is the **logical** tail (e.g. `send`).
 * SYNRA-COMM::MESSAGE_ENVELOPE::SEND::USE_SYNRA_PLUGIN_EVENT_POST
 */
export function useSynraPluginEvent(pluginPackageNameOrSlug: string) {
  const slug = normalizePluginPackageNameToWireSlug(pluginPackageNameOrSlug)
  const ev = useSynraEnvelope()

  function mapPluginInbound(m: SynraInboundEnvelope): SynraInboundEnvelope | null {
    const p = toLogicalFromPluginWireEvent(m.event)
    if (!p || p.slug !== slug) {
      return null
    }
    return { ...m, event: p.event }
  }

  async function send(
    partial: Partial<SynraMessageEnvelope> & Pick<SynraMessageEnvelope, 'event' | 'target'>
  ): Promise<SynraMessageEnvelope> {
    const out = await ev.send({
      ...partial,
      event: toPluginWireEvent(slug, partial.event)
    } as Parameters<ReturnType<typeof useSynraEnvelope>['send']>[0])
    const parsed = toLogicalFromPluginWireEvent(out.event)
    return { ...out, event: parsed?.event ?? out.event }
  }

  function subscribe(
    handler: (message: SynraInboundEnvelope) => void | Promise<void>,
    filter?: SynraInboundFilter
  ): () => void {
    return ev.subscribe((m) => {
      const logical = mapPluginInbound(m)
      if (!logical) {
        return
      }
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
      .request({ ...partial, event: toPluginWireEvent(slug, partial.event) } as never, options)
      .then((m) => {
        const logical = mapPluginInbound(m)
        if (!logical) {
          throw new Error(
            'useSynraPluginEvent request: response event does not match plugin scope.'
          )
        }
        return logical
      })
  }

  return {
    getRuntimeSurface: () => ev.getRuntimeSurface(),
    pluginWireSlug: slug,
    send,
    subscribe,
    request
  }
}
