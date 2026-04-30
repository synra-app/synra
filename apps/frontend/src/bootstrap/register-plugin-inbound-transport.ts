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
