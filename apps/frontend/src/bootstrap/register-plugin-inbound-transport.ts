import { Capacitor } from '@capacitor/core'
import { getConnectionRuntime } from '@synra/hooks'
import type {
  FileTransferAbortPayload,
  FileTransferChunkPayload,
  FileTransferCompletePayload
} from '@synra/protocol'
import { PluginBundleTransferAssembly } from '@synra/protocol'
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

/**
 * Plugin-side "please open this URL on your side" request.
 *
 * Convention: any plugin whose `package.json` declares capability
 * `device:broadcast` or `device:send` may emit the logical event
 * `open-url` (wire: `_plugin.{slug}.open-url`) with payload `{ url }`.
 * The host that receives it dispatches the URL to its native shell
 * opener — Electron host routes via `shell.openExternal`, which makes
 * the system default browser open on the host machine. This is the
 * "tap on phone → opens on PC" pattern; the phone never opens the URL
 * itself.
 */
const PLUGIN_OPEN_URL_RE = /^_plugin\.[^.]+\.open-url$/
const PLUGIN_PING_RE = /^_plugin\.[^.]+\.ping$/
const PLUGIN_COPY_SELECTION_RE = /^_plugin\.[^.]+\.copy-selection$/

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

          // Plugin request: "open this URL on the host that received it".
          // Used by the mobile starter's External tab — the phone sends
          // `_plugin.<slug>.open-url` and picks a target device in its
          // own UI; the paired Electron host catches it here and routes
          // through the main process `shell.openExternal`. The phone
          // never opens the URL itself. After dispatch we send an ack
          // back as `_plugin.<slug>.open-url.reply` so the phone UI
          // sees confirmation that the command actually fired (and
          // any failure reason if the IPC threw).
          if (PLUGIN_OPEN_URL_RE.test(ev)) {
            const payload = (env.payload ?? {}) as { url?: unknown }
            const url = typeof payload.url === 'string' ? payload.url.trim() : ''
            if (!url) {
              // Still ack — phone should know its empty payload was
              // rejected rather than silently dropped.
              const slugMatch = /^_plugin\.([^.]+)\.open-url$/.exec(ev)
              const replyEvent = slugMatch ? `_plugin.${slugMatch[1]}.open-url.reply` : ''
              console.log(`[synra][ext-receive] empty url from=${env.from} event=${ev}`)
              if (replyEvent) {
                try {
                  await runtime.sendMessage({
                    requestId: crypto.randomUUID(),
                    event: replyEvent,
                    target: env.from,
                    from: localId,
                    replyRequestId: env.requestId,
                    payload: { url: '', ok: false, reason: 'missing url' },
                    timestamp: Date.now()
                  })
                } catch {
                  /* ignore — best effort */
                }
              }
              return
            }
            const capElectron = (window as { __synraCapElectron?: { invoke?: unknown } })
              .__synraCapElectron
            const slugMatch = /^_plugin\.([^.]+)\.open-url$/.exec(ev)
            const replyEvent = slugMatch ? `_plugin.${slugMatch[1]}.open-url.reply` : ''
            let dispatchOk = false
            let dispatchReason = ''
            if (capElectron && typeof capElectron.invoke === 'function') {
              try {
                await (
                  capElectron.invoke as (method: string, payload: unknown) => Promise<unknown>
                )('external.open', { url })
                dispatchOk = true
              } catch (error) {
                const { message, code, stackSnippet } = formatUnknownErrorForLog(error)
                dispatchReason = message
                console.error('[synra][ext-dispatch-fail]', {
                  from: env.from,
                  event: ev,
                  message,
                  code,
                  stackSnippet
                })
              }
            } else {
              // Plain-web host (no Electron shell): best-effort `window.open`.
              // Keeps the demo useful when a paired host isn't Electron.
              try {
                const opened = window.open(url, '_blank', 'noopener,noreferrer')
                dispatchOk = opened !== null
                if (!dispatchOk) dispatchReason = 'window.open returned null'
              } catch (error) {
                const { message } = formatUnknownErrorForLog(error)
                dispatchReason = message
              }
            }
            console.log(
              `[synra][ext-reply] url=${url} target=${env.from} ok=${dispatchOk}${
                dispatchReason ? ` reason=${dispatchReason}` : ''
              }`
            )
            // Ack the originator. Use the same slug the request came
            // in under so the phone's envelope subscriber (`bridge
            // .useSynraPluginEnvelope().subscribe`) receives it.
            if (replyEvent) {
              try {
                await runtime.sendMessage({
                  requestId: crypto.randomUUID(),
                  event: replyEvent,
                  target: env.from,
                  from: localId,
                  replyRequestId: env.requestId,
                  payload: { url, ok: dispatchOk, reason: dispatchReason },
                  timestamp: Date.now()
                })
                console.log(`[synra][ext-ack-sent] event=${replyEvent} target=${env.from}`)
              } catch (sendError) {
                const { message, code, stackSnippet } = formatUnknownErrorForLog(sendError)
                console.error('[synra][ext-ack-fail]', {
                  from: env.from,
                  event: replyEvent,
                  message,
                  code,
                  stackSnippet
                })
              }
            }
          }

          // Plugin request: "send me whatever is currently selected on
          // the host (highlighted text)". Backed by `clipboard.readSelection`
          // bridge method — Electron main triggers the platform's native
          // copy shortcut (Ctrl+C / Cmd+C / xdotool ctrl+c), reads the
          // resulting clipboard, and restores the original clipboard so
          // the action is non-destructive for the user. The phone's
          // starter "复制选中" tab fires this on a button tap; we capture
          // the host's current text selection and reply with
          // `_plugin.<slug>.copy-selection.reply` carrying
          // `{ text, ok, reason }`. NOTE: this is *not* the same as
          // `clipboard.read` — that returns the last-copied text, this
          // returns whatever is highlighted by the cursor right now.
          if (PLUGIN_COPY_SELECTION_RE.test(ev)) {
            const slugMatch = /^_plugin\.([^.]+)\.copy-selection$/.exec(ev)
            const replyEvent = slugMatch ? `_plugin.${slugMatch[1]}.copy-selection.reply` : ''
            const capElectron = (window as { __synraCapElectron?: { invoke?: unknown } })
              .__synraCapElectron
            let text = ''
            let dispatchOk = false
            let dispatchReason = ''
            if (capElectron && typeof capElectron.invoke === 'function') {
              try {
                const result = await (
                  capElectron.invoke as (
                    method: string,
                    payload: unknown
                  ) => Promise<{ text?: unknown } | undefined>
                )('clipboard.readSelection', {})
                const candidateText =
                  result && typeof result === 'object' && 'text' in result
                    ? (result as { text?: unknown }).text
                    : undefined
                text = typeof candidateText === 'string' ? candidateText : ''
                dispatchOk = true
                if (text.length === 0) {
                  // captureOsTextSelection returns '' when the OS
                  // automation tool is missing (no xdotool / no
                  // Accessibility permission / no PowerShell) or when
                  // nothing was selected. Surface a distinct reason so
                  // the phone UI can show a hint instead of an empty
                  // text bubble.
                  dispatchReason = 'no text selected (or host automation unavailable)'
                }
              } catch (error) {
                const { message } = formatUnknownErrorForLog(error)
                dispatchReason = message
                console.error('[synra][cb-dispatch-fail]', {
                  from: env.from,
                  event: ev,
                  message
                })
              }
            } else {
              // Plain-web host (no Electron shell): no clipboard read
              // capability. Reply with `ok:false reason:'no clipboard
              // capability on this host'` so the phone UI surfaces a
              // meaningful error instead of hanging.
              dispatchReason = 'no clipboard capability on this host'
            }
            console.log(
              `[synra][cb-reply] target=${env.from} ok=${dispatchOk} len=${text.length}${
                dispatchReason ? ` reason=${dispatchReason}` : ''
              }`
            )
            if (replyEvent) {
              try {
                await runtime.sendMessage({
                  requestId: crypto.randomUUID(),
                  event: replyEvent,
                  target: env.from,
                  from: localId,
                  replyRequestId: env.requestId,
                  payload: { text, ok: dispatchOk, reason: dispatchReason },
                  timestamp: Date.now()
                })
                console.log(`[synra][cb-ack-sent] event=${replyEvent} target=${env.from}`)
              } catch (sendError) {
                const { message, code, stackSnippet } = formatUnknownErrorForLog(sendError)
                console.error('[synra][cb-ack-fail]', {
                  from: env.from,
                  event: replyEvent,
                  message,
                  code,
                  stackSnippet
                })
              }
            }
          }

          // Plugin debug "ping" — used by the starter plugin's Ping
          // tab to round-trip a single envelope through the LAN
          // transport. The host logs the receive, then immediately
          // sends back `_plugin.<slug>.ping.ack` so the phone sees
          // the round-trip completion without any user interaction
          // on the PC side. This is the smallest possible end-to-end
          // flow and is the baseline we use to debug transport
          // issues (capability mismatch, target routing, envelope
          // prefix, etc.).
          if (PLUGIN_PING_RE.test(ev)) {
            const slugMatch = /^_plugin\.([^.]+)\.ping$/.exec(ev)
            const ackEvent = slugMatch ? `_plugin.${slugMatch[1]}.ping.ack` : ''
            const payload = (env.payload ?? {}) as { from?: unknown; seq?: unknown; t?: unknown }
            const seq = typeof payload.seq === 'number' ? payload.seq : -1
            console.log(`[synra][ping-receive] from=${env.from} event=${ev} seq=${seq}`)
            if (ackEvent) {
              try {
                await runtime.sendMessage({
                  requestId: crypto.randomUUID(),
                  event: ackEvent,
                  target: env.from,
                  from: localId,
                  replyRequestId: env.requestId,
                  payload: {
                    seq,
                    echo: payload,
                    receivedAt: Date.now(),
                    fromLocal: localId
                  },
                  timestamp: Date.now()
                })
                console.log(
                  `[synra][ping-ack-sent] event=${ackEvent} target=${env.from} seq=${seq}`
                )
              } catch (sendError) {
                const { message, code, stackSnippet } = formatUnknownErrorForLog(sendError)
                console.error('[synra][ping-ack-fail]', {
                  from: env.from,
                  event: ackEvent,
                  message,
                  code,
                  stackSnippet
                })
              }
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
