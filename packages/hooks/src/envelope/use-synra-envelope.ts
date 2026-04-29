import { isLanWireEventName } from '@synra/protocol'
import {
  getSynraEnvelopeRuntimeSurface,
  isHostOnlySynraEvent,
  normalizePartialOutbound,
  parseSynraMessageEnvelope,
  resolveSynraPostTransport,
  stripForTransportRouting,
  toConnectionSendInput,
  toLanSendInput,
  type SynraEnvelopeRuntimeSurface,
  type SynraInboundEnvelope,
  type SynraMessageEnvelope
} from '@synra/envelope'
import { getConnectionRuntime } from '../runtime/core'
import { dispatchHostEnvelopeFromMainIfRegistered } from '../synra/host-envelope-main-dispatch'
import { resolveWireFromForSynra } from './resolve-wire-from'
import {
  isUuidLike,
  matchesFilter,
  type SynraInboundFilter,
  type UseSynraEnvelopeRequestOptions,
  USE_SYNRA_ENVELOPE_DEFAULT_TIMEOUT_MS
} from './use-synra-envelope-helpers'
import type { SynraConnectionMessage } from '../types'
import type { SynraLanWireEvent } from '../types'

export type {
  SynraEnvelopeRuntimeSurface,
  SynraInboundEnvelope,
  SynraMessageEnvelope
} from '@synra/envelope'
export type { SynraInboundFilter, UseSynraEnvelopeRequestOptions }
export { USE_SYNRA_ENVELOPE_DEFAULT_TIMEOUT_MS } from './use-synra-envelope-helpers'

type HostEnvelopeWindow = typeof globalThis & {
  __synraHostEnvelope?: {
    subscribe: (cb: (e: unknown) => void) => () => void
    postToMain: (e: unknown) => Promise<unknown>
  }
}

/**
 * Core transport: `event` is the **on-wire** name (e.g. `_synra.device.*`, `_plugin.{slug}.*`, or legacy protocol names without prefix).
 * Use `useSynraSystemEnvelope` / `useSynraPluginEnvelope` for app/plugin code; they add prefixes and map logical `event` in callbacks.
 * SYNRA-COMM::MESSAGE_ENVELOPE::SEND::SYNRA_ENVELOPE_POST
 * SYNRA-COMM::MESSAGE_ENVELOPE::RECEIVE::SYNRA_ENVELOPE_SUBSCRIBE
 */
export function useSynraEnvelope() {
  const runtime = getConnectionRuntime()
  const surface: SynraEnvelopeRuntimeSurface = getSynraEnvelopeRuntimeSurface()

  async function ensureReadyForTransport(): Promise<void> {
    if (surface === 'web') {
      return
    }
    await runtime.ensureListeners()
  }

  function toInboundFromConnection(m: SynraConnectionMessage): SynraInboundEnvelope {
    return {
      requestId: m.requestId,
      event: m.event,
      target: m.target,
      from: m.from,
      replyRequestId: m.replyRequestId,
      payload: m.payload,
      timestamp: m.timestamp,
      kind: 'connection'
    }
  }

  function toInboundFromLan(w: SynraLanWireEvent): SynraInboundEnvelope {
    return {
      requestId: w.requestId,
      event: w.event,
      target: w.target,
      from: w.from,
      replyRequestId: w.replyRequestId,
      payload: w.payload,
      timestamp: w.timestamp,
      kind: 'lan'
    }
  }

  function toInboundFromHost(m: SynraMessageEnvelope): SynraInboundEnvelope {
    return {
      ...m,
      timestamp: m.timestamp ?? Date.now(),
      kind: 'host'
    }
  }

  function toFullEnvelope(b: ReturnType<typeof normalizePartialOutbound>): SynraMessageEnvelope {
    return {
      requestId: b.requestId,
      event: b.event,
      target: b.target,
      from: b.from,
      replyRequestId: b.replyRequestId,
      payload: b.payload,
      timestamp: b.timestamp
    }
  }

  async function send(
    partial: Partial<SynraMessageEnvelope> & Pick<SynraMessageEnvelope, 'event' | 'target'>
  ): Promise<SynraMessageEnvelope> {
    if (typeof partial.event !== 'string' || partial.event.length === 0) {
      throw new Error('useSynraEnvelope send: event is required.')
    }
    if (typeof partial.target !== 'string' || partial.target.length === 0) {
      throw new Error('useSynraEnvelope send: target is required.')
    }

    const base = normalizePartialOutbound({
      event: partial.event,
      target: partial.target,
      from: partial.from,
      requestId: partial.requestId,
      replyRequestId: partial.replyRequestId,
      payload: partial.payload,
      timestamp: partial.timestamp,
      resolveFrom: () => resolveWireFromForSynra()
    })
    if (!isHostOnlySynraEvent(base.event) && !isUuidLike(base.from)) {
      throw new Error('useSynraEnvelope: local from UUID is invalid or missing.')
    }

    const full = toFullEnvelope(base)
    const route = resolveSynraPostTransport(base.event)

    if (route === 'host') {
      if (surface === 'electron-renderer') {
        const w = globalThis as HostEnvelopeWindow
        if (!w.__synraHostEnvelope) {
          throw new Error(
            'useSynraEnvelope: host envelope bridge is not available (Electron preload not loaded).'
          )
        }
        await w.__synraHostEnvelope.postToMain(full)
        return full
      }
      if (surface === 'electron-main') {
        dispatchHostEnvelopeFromMainIfRegistered(full)
        return full
      }
      throw new Error('useSynraEnvelope: host-only events are only supported in Electron.')
    }

    await ensureReadyForTransport()
    if (route === 'lan') {
      const native = stripForTransportRouting(full.event)
      if (!isLanWireEventName(native)) {
        throw new Error('useSynraEnvelope: inconsistent route for event after prefix strip.')
      }
      await runtime.sendLanEvent(toLanSendInput({ ...full, event: native }))
      return full
    }
    await runtime.sendMessage(toConnectionSendInput(full))
    return full
  }

  function subscribe(
    handler: (message: SynraInboundEnvelope) => void | Promise<void>,
    filter?: SynraInboundFilter
  ): () => void {
    const unsubs: Array<() => void> = []
    unsubs.push(
      runtime.onLanWireEvent(
        (ev) => {
          const m = toInboundFromLan(ev)
          if (filter?.replyRequestId !== undefined && filter.replyRequestId !== m.replyRequestId) {
            return
          }
          if (matchesFilter(m, filter)) {
            void Promise.resolve(handler(m))
          }
        },
        {
          requestId: filter?.requestId,
          event: filter?.event as import('@synra/protocol').LanWireEventName,
          deviceId: filter?.deviceId
        }
      )
    )
    unsubs.push(
      runtime.onMessage(
        (msg) => {
          const m = toInboundFromConnection(msg)
          if (filter?.replyRequestId !== undefined && filter.replyRequestId !== m.replyRequestId) {
            return
          }
          if (matchesFilter(m, filter)) {
            void Promise.resolve(handler(m))
          }
        },
        {
          requestId: filter?.requestId,
          event: filter?.event,
          deviceId: filter?.deviceId
        }
      )
    )

    const w = globalThis as HostEnvelopeWindow
    if (w.__synraHostEnvelope) {
      unsubs.push(
        w.__synraHostEnvelope.subscribe((raw) => {
          const parsed = parseSynraMessageEnvelope(raw)
          if (!parsed) {
            return
          }
          const m = toInboundFromHost(parsed)
          if (filter?.replyRequestId !== undefined && filter.replyRequestId !== m.replyRequestId) {
            return
          }
          if (matchesFilter(m, filter)) {
            void Promise.resolve(handler(m))
          }
        })
      )
    }

    return () => {
      for (const u of unsubs) {
        u()
      }
    }
  }

  function request(
    partial: Partial<SynraMessageEnvelope> &
      Pick<SynraMessageEnvelope, 'event' | 'target' | 'payload'>,
    options?: UseSynraEnvelopeRequestOptions
  ): Promise<SynraInboundEnvelope> {
    const requestId =
      globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const timeoutMs = options?.timeoutMs ?? USE_SYNRA_ENVELOPE_DEFAULT_TIMEOUT_MS
    return new Promise((resolve, reject) => {
      const signal = options?.signal
      const onAbort = (): void => {
        cleanup()
        const err = new Error('useSynraEnvelope request aborted') as Error & { name?: string }
        if (signal?.aborted) {
          err.name = 'AbortError'
        }
        reject(err)
      }
      if (signal?.aborted) {
        onAbort()
        return
      }
      signal?.addEventListener('abort', onAbort, { once: true })
      const t = setTimeout(() => {
        cleanup()
        reject(new Error('useSynraEnvelope request timeout'))
      }, timeoutMs)
      function cleanup(): void {
        clearTimeout(t)
        off()
        signal?.removeEventListener('abort', onAbort)
      }
      const off = subscribe(
        (m) => {
          if (m.replyRequestId === requestId) {
            cleanup()
            resolve(m)
          }
        },
        { replyRequestId: requestId }
      )
      void send({
        ...partial,
        requestId,
        replyRequestId: undefined
      } as Partial<SynraMessageEnvelope> & Pick<SynraMessageEnvelope, 'event' | 'target'>)
        .then(() => undefined)
        .catch((e) => {
          cleanup()
          reject(e)
        })
    })
  }

  return {
    getRuntimeSurface: () => surface,
    send,
    subscribe,
    request
  }
}
