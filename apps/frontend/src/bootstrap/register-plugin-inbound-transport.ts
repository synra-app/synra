import { Capacitor } from '@capacitor/core'
import { getConnectionRuntime, type ConnectionRuntime } from '@synra/hooks'
import type {
  FileTransferAbortPayload,
  FileTransferChunkPayload,
  FileTransferCompletePayload
} from '@synra/protocol'
import { PluginBundleTransferAssembly } from '@synra/protocol'
import type { SynraMessageEnvelope } from '@synra/hooks'
import { dispatchPluginInstallStoreChanged } from '../lib/plugin-install-store-events'
import { ensureDeviceInstanceUuid } from '../lib/device-instance-uuid'
import { persistInboundPluginBundleFromTgzBuffer } from '../plugins/bridge/capacitor-plugin-host'
import { tryGetSynraPluginRuntimeBridge } from '../plugins/bridge/synra-plugin-host-bridge'
import { syncInstalledPlugins } from '../plugins/host'

/** Single promise so we do not run multiple Preferences native reads with nondeterministic completion order. */
let inboundLocalDeviceIdPromise: Promise<string> | null = null
function getInboundLocalDeviceId(): Promise<string> {
  inboundLocalDeviceIdPromise ??= ensureDeviceInstanceUuid()
  return inboundLocalDeviceIdPromise
}

/** Matches `useSynraSystemEnvelope` wire prefix for logical `plugin.installed.query`. */
const QUERY_WIRE = '_synra.plugin.installed.query'
const QUERY_REPLY_WIRE = '_synra.plugin.installed.query.reply'

/** Wire prefix shared by every per-plugin envelope event. */
const PLUGIN_ENVELOPE_RE = /^_plugin\.([^.]+)\.([a-z-]+)$/

const INBOUND_ERROR_STACK_MAX = 800

function formatUnknownErrorForLog(error: unknown): {
  message: string
  code?: string
  stackSnippet?: string
} {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : error && typeof error === 'object' && 'message' in error
          ? String((error as { message?: unknown }).message)
          : String(error)
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: unknown }).code)
      : undefined
  const stack = error instanceof Error && typeof error.stack === 'string' ? error.stack : undefined
  const stackSnippet =
    stack && stack.length > INBOUND_ERROR_STACK_MAX
      ? `${stack.slice(0, INBOUND_ERROR_STACK_MAX)}…`
      : stack
  return { message, code, stackSnippet }
}

/**
 * Per-verb envelope reply dispatcher spec. Each entry teaches the
 * shared reply dispatcher (`dispatchPluginEnvelopeReply`) how to
 * handle one of `_plugin.<slug>.<verb>` envelopes:
 *
 *   - `verb`                  — the literal verb segment matched against `PLUGIN_ENVELOPE_RE`
 *   - `logPrefix`             — tag used for `[synra][<prefix>-*]` log lines
 *   - `replyEventFor(slug)`   — builds the reply/ack event name (e.g. `_plugin.<slug>.open-url.reply`)
 *   - `dispatch({ env, payload })` — host-side work; returns
 *       `{ ok, reason?, payload: <reply shape> }`. Throwing is treated
 *       as `{ ok: false, reason: <message> }` and logged via
 *       `[<prefix>-dispatch-fail]`.
 *
 * Adding a new per-plugin verb is now a single table entry; the
 * envelope-reply boilerplate (slug capture, reply event, ack send,
 * log lines, error logging) lives in one place.
 */
type PluginVerbHandler = {
  verb: string
  logPrefix: string
  replyEventFor: (slug: string) => string
  dispatch: (args: {
    env: SynraMessageEnvelope
    payload: unknown
  }) => Promise<{ ok: boolean; reason?: string; payload: Record<string, unknown> }>
}

/**
 * Shared envelope-reply dispatcher. Resolves the slug from the
 * `_plugin.<slug>.<verb>` envelope, runs the verb-specific dispatch,
 * logs `[<prefix>-reply]` / `[<prefix>-ack-sent]` / `[<prefix>-ack-fail]`,
 * and sends the reply envelope back to the originator.
 */
async function dispatchPluginEnvelopeReply(args: {
  env: SynraMessageEnvelope
  runtime: ConnectionRuntime
  localId: string
  slug: string
  handler: PluginVerbHandler
}): Promise<void> {
  const { env, runtime, localId, slug, handler } = args
  const replyEvent = handler.replyEventFor(slug)
  let dispatchOk = false
  let dispatchReason = ''
  let replyPayload: Record<string, unknown> = {}
  try {
    const result = await handler.dispatch({ env, payload: env.payload })
    dispatchOk = result.ok
    dispatchReason = result.reason ?? ''
    replyPayload = result.payload
  } catch (error) {
    const { message, code, stackSnippet } = formatUnknownErrorForLog(error)
    dispatchReason = message
    console.error(`[synra][${handler.logPrefix}-dispatch-fail]`, {
      from: env.from,
      event: env.event,
      message,
      code,
      stackSnippet
    })
  }
  console.log(
    `[synra][${handler.logPrefix}-reply] target=${env.from} ok=${dispatchOk}${
      dispatchReason ? ` reason=${dispatchReason}` : ''
    }`
  )
  try {
    await runtime.sendMessage({
      requestId: crypto.randomUUID(),
      event: replyEvent,
      target: env.from,
      from: localId,
      replyRequestId: env.requestId,
      payload: replyPayload,
      timestamp: Date.now()
    })
    console.log(`[synra][${handler.logPrefix}-ack-sent] event=${replyEvent} target=${env.from}`)
  } catch (sendError) {
    const { message, code, stackSnippet } = formatUnknownErrorForLog(sendError)
    console.error(`[synra][${handler.logPrefix}-ack-fail]`, {
      from: env.from,
      event: replyEvent,
      message,
      code,
      stackSnippet
    })
  }
}

/**
 * Per-plugin envelope verb table. Order does not matter — the
 * dispatcher matches `PLUGIN_ENVELOPE_RE` once and routes to the
 * entry whose `verb` matches.
 */
const PLUGIN_VERB_HANDLERS: ReadonlyArray<PluginVerbHandler> = [
  // "Tap on phone → opens on the paired PC" — the External tab. The
  // phone sends `_plugin.<slug>.open-url` and picks a target device in
  // its own UI; the paired Electron host catches it here and routes
  // through the main process `shell.openExternal`. The phone never
  // opens the URL itself. We always reply with `_plugin.<slug>.open-url.reply`
  // so the phone UI sees confirmation that the command actually fired.
  {
    verb: 'open-url',
    logPrefix: 'ext',
    replyEventFor: (slug) => `_plugin.${slug}.open-url.reply`,
    async dispatch({ payload }) {
      const candidate = (payload ?? {}) as { url?: unknown }
      const url = typeof candidate.url === 'string' ? candidate.url.trim() : ''
      if (!url) {
        return { ok: false, reason: 'missing url', payload: { url: '', ok: false } }
      }
      const capElectron = (globalThis as { __synraCapElectron?: { invoke?: unknown } })
        .__synraCapElectron
      if (capElectron && typeof capElectron.invoke === 'function') {
        await (capElectron.invoke as (method: string, payload: unknown) => Promise<unknown>)(
          'external.open',
          { url }
        )
        return { ok: true, payload: { url, ok: true } }
      }
      // Plain-web host (no Electron shell): best-effort `window.open`.
      // Keeps the demo useful when a paired host isn't Electron.
      const opened = window.open(url, '_blank', 'noopener,noreferrer')
      return opened !== null
        ? { ok: true, payload: { url, ok: true } }
        : { ok: false, reason: 'window.open returned null', payload: { url, ok: false } }
    }
  },

  // "Send me whatever is currently selected on the host". Backed by
  // `clipboard.readSelection` — Electron main triggers the platform's
  // native copy shortcut (Ctrl+C / Cmd+C / xdotool ctrl+c), reads the
  // resulting clipboard, and restores the original clipboard so the
  // action is non-destructive. We reply with
  // `_plugin.<slug>.copy-selection.reply` carrying `{ text, ok, reason }`.
  {
    verb: 'copy-selection',
    logPrefix: 'cb',
    replyEventFor: (slug) => `_plugin.${slug}.copy-selection.reply`,
    async dispatch() {
      const capElectron = (globalThis as { __synraCapElectron?: { invoke?: unknown } })
        .__synraCapElectron
      if (!capElectron || typeof capElectron.invoke !== 'function') {
        // Plain-web host (no Electron shell): no clipboard read
        // capability. Reply with `ok:false reason:'no clipboard capability
        // on this host'` so the phone UI surfaces a meaningful error.
        return {
          ok: false,
          reason: 'no clipboard capability on this host',
          payload: { text: '', ok: false }
        }
      }
      const result = await (
        capElectron.invoke as (
          method: string,
          payload: unknown
        ) => Promise<{ text?: unknown } | undefined>
      )('clipboard.readSelection', {})
      const text =
        result && typeof result === 'object' && 'text' in result && typeof result.text === 'string'
          ? result.text
          : ''
      // captureOsTextSelection returns '' when the OS automation tool
      // is missing (no xdotool / no Accessibility permission / no
      // PowerShell) or when nothing was selected. Surface a distinct
      // reason so the phone UI can show a hint instead of an empty
      // text bubble.
      const reason = text.length === 0 ? 'no text selected (or host automation unavailable)' : ''
      return { ok: true, reason, payload: { text, ok: true, reason } }
    }
  },

  // Plugin debug "ping" — used by the starter plugin's Ping tab to
  // round-trip a single envelope through the LAN transport. The host
  // logs the receive, then immediately sends back
  // `_plugin.<slug>.ping.ack` so the phone sees the round-trip
  // completion without any user interaction on the PC side. This is
  // the smallest possible end-to-end flow and is the baseline we use
  // to debug transport issues (capability mismatch, target routing,
  // envelope prefix, etc.).
  {
    verb: 'ping',
    logPrefix: 'ping',
    replyEventFor: (slug) => `_plugin.${slug}.ping.ack`,
    async dispatch({ env, payload }) {
      const candidate = (payload ?? {}) as { seq?: unknown }
      const seq = typeof candidate.seq === 'number' ? candidate.seq : -1
      console.log(`[synra][ping-receive] from=${env.from} event=${env.event} seq=${seq}`)
      return {
        ok: true,
        payload: {
          seq,
          echo: payload,
          receivedAt: Date.now(),
          fromLocal: env.target
        }
      }
    }
  }
]

/**
 * Registers TCP connection handlers for plugin bundle receive and installed-version preflight replies.
 * SYNRA-COMM::FILE_TRANSFER::RECEIVE::ASSEMBLE_BUFFER (Capacitor native only for persistence).
 *
 * Inbound messages are processed **serially** so chunk/complete ordering matches TCP delivery despite
 * async `messageReceived` handlers.
 */
export function registerPluginInboundTransportHandlers(): void {
  const runtime = getConnectionRuntime()
  const assemblies = new Map<string, PluginBundleTransferAssembly>()
  let inboundTail = Promise.resolve()

  void runtime.ensureListeners().then(() => {
    runtime.onMessage((msg) => {
      inboundTail = inboundTail
        .then(async () => {
          const env = msg.envelope
          const ev = env.event
          const localId = await getInboundLocalDeviceId()
          if (env.target !== localId) {
            return
          }

          if (ev === QUERY_WIRE) {
            const payload = (env.payload ?? {}) as { pluginId?: string }
            const pluginId = payload.pluginId?.trim()
            let version: string | null = null
            const bridge = tryGetSynraPluginRuntimeBridge()
            if (bridge && pluginId) {
              try {
                const list = await bridge.listInstalledPlugins()
                version = list.plugins.find((p) => p.pluginId === pluginId)?.version ?? null
              } catch {
                version = null
              }
            }
            await runtime.sendMessage({
              requestId: crypto.randomUUID(),
              event: QUERY_REPLY_WIRE,
              target: env.from,
              from: localId,
              replyRequestId: env.requestId,
              payload: { pluginId, version },
              timestamp: Date.now()
            })
            return
          }

          if (ev === 'file.transfer.chunk') {
            const payload = env.payload as FileTransferChunkPayload
            if (payload?.kind !== 'plugin-bundle') {
              return
            }
            const p = payload as Extract<FileTransferChunkPayload, { kind: 'plugin-bundle' }>
            let asm = assemblies.get(p.transferId)
            if (!asm) {
              asm = new PluginBundleTransferAssembly(p.transferId)
              assemblies.set(p.transferId, asm)
            }
            const err = asm.push(p)
            if (err) {
              assemblies.delete(p.transferId)
            }
            return
          }

          if (ev === 'file.transfer.complete') {
            const payload = env.payload as FileTransferCompletePayload
            if (payload?.kind !== 'plugin-bundle') {
              return
            }
            const p = payload as Extract<FileTransferCompletePayload, { kind: 'plugin-bundle' }>
            const asm = assemblies.get(p.transferId)
            if (!asm?.isComplete()) {
              return
            }
            if (!Capacitor.isNativePlatform()) {
              assemblies.delete(p.transferId)
              return
            }
            try {
              const u8 = asm.concat()
              const buf = u8.buffer.slice(
                u8.byteOffset,
                u8.byteOffset + u8.byteLength
              ) as ArrayBuffer
              const summary = await persistInboundPluginBundleFromTgzBuffer(buf)
              await syncInstalledPlugins([summary], crypto.randomUUID())
              dispatchPluginInstallStoreChanged()
              assemblies.delete(p.transferId)
            } catch (error) {
              const { message, code, stackSnippet } = formatUnknownErrorForLog(error)
              console.error('[synra] inbound plugin bundle persist failed', {
                transferId: p.transferId,
                pluginId: p.pluginId,
                version: p.version,
                message,
                code,
                stackSnippet
              })
            }
            return
          }

          if (ev === 'file.transfer.abort') {
            const payload = env.payload as FileTransferAbortPayload
            if (payload?.transferId) {
              assemblies.delete(payload.transferId)
            }
            return
          }

          // Plugin envelope verbs (`_plugin.<slug>.<verb>`). Resolved
          // through `PLUGIN_VERB_HANDLERS` so the per-verb code is
          // dispatch-only — envelope-reply boilerplate (slug capture,
          // ack send, log lines) lives in `dispatchPluginEnvelopeReply`.
          const pluginMatch = PLUGIN_ENVELOPE_RE.exec(ev)
          if (pluginMatch) {
            const slug = pluginMatch[1]
            const verb = pluginMatch[2]
            const handler = PLUGIN_VERB_HANDLERS.find((h) => h.verb === verb)
            if (handler) {
              await dispatchPluginEnvelopeReply({
                env,
                runtime,
                localId,
                slug,
                handler
              })
            }
          }
        })
        .catch((err: unknown) => {
          const { message, code, stackSnippet } = formatUnknownErrorForLog(err)
          console.error('[synra] inbound plugin transport handler failed', {
            message,
            code,
            stackSnippet
          })
        })
    })
  })
}
