import type { SynraEventInbound, SynraMessageEnvelope } from '../synra/synra-envelope'
import {
  normalizePluginPackageNameToWireSlug,
  toLogicalFromPluginWireEvent,
  toPluginWireEvent
} from '../synra/synra-event-prefix'
import { useEvent } from './use-event'
import {
  matchesFilter,
  type SynraEventOnFilter,
  type UseSynraEventRequestOptions
} from './use-synra-event-helpers'

export type { SynraEventInbound, SynraMessageEnvelope } from '../synra/synra-envelope'
export type { SynraEventRuntimeSurface } from './use-event'
export type { SynraEventOnFilter, UseSynraEventRequestOptions }

/**
 * Plugin event helper: same as `useSynraEvent` but with `_plugin.{pluginSlug}.{logicalEvent}` on the wire
 * (e.g. package `@synra-plugin/chat` + `postMessage({ event: 'send' })` → `_plugin.chat.send`).
 * Inbound `event` in the callback is the **logical** tail (e.g. `send`).
 * SYNRA-COMM::MESSAGE_ENVELOPE::SEND::USE_SYNRA_PLUGIN_EVENT_POST
 */
export function useSynraPluginEvent(pluginPackageNameOrSlug: string) {
  const slug = normalizePluginPackageNameToWireSlug(pluginPackageNameOrSlug)
  const ev = useEvent()

  function mapPluginInbound(m: SynraEventInbound): SynraEventInbound | null {
    const p = toLogicalFromPluginWireEvent(m.event)
    if (!p || p.slug !== slug) {
      return null
    }
    return { ...m, event: p.event }
  }

  async function postMessage(
    partial: Partial<SynraMessageEnvelope> & Pick<SynraMessageEnvelope, 'event' | 'target'>
  ): Promise<SynraMessageEnvelope> {
    const out = await ev.postMessage({
      ...partial,
      event: toPluginWireEvent(slug, partial.event)
    } as Parameters<ReturnType<typeof useEvent>['postMessage']>[0])
    const parsed = toLogicalFromPluginWireEvent(out.event)
    return { ...out, event: parsed?.event ?? out.event }
  }

  function onMessage(
    handler: (message: SynraEventInbound) => void | Promise<void>,
    filter?: SynraEventOnFilter
  ): () => void {
    return ev.onMessage((m) => {
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
    options?: UseSynraEventRequestOptions
  ): Promise<SynraEventInbound> {
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
    postMessage,
    onMessage,
    request
  }
}
