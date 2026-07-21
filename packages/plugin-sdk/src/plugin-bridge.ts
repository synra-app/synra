/**
 * v3 PluginBridge: closure-bound surface for plugins.
 *
 * Host-side factory (`createPluginBridge`) — bundles the host's singletons
 * into a closure-shaped object that the plugin consumes via
 * `inject(SYNRA_BRIDGE_KEY)`. Plugin bundle imports only `import type` from
 * `@synra/plugin-sdk`, so no runtime bare specifier is shipped.
 *
 * State sharing: `usePairedDevices()` and `useSynraPluginEnvelope()` are
 * pulled directly from `@synra/hooks` — both close over the same module
 * singletons the host uses (`pairedDevicesStorageEpoch`,
 * `getConnectionRuntime()`), so a host-side
 * `bumpPairedDevicesStorageEpoch()` triggers reactivity in the plugin's
 * `useMessagesPage()` without an importmap.
 *
 * Capabilities: there is no permission gate. The `synra.capabilities`
 * array on the plugin's `package.json` is read for introspection
 * (`bridge.capabilities`) and surfaced in the host UI, but every call
 * (`send`, `broadcast`, `fetch`, `readFile`) is allowed unconditionally.
 * Plugins run inside the host's renderer / WebView, which already has
 * the user's implicit trust; the original capability gate caused more
 * pain than protection in v3 testing (per-target fine-grained checks
 * like `device:send:<target-id>` silently mismatch when the declared
 * array is missing the prefix, with no easy way for plugin authors to
 * see what was actually matched). Trust is replaced with host-level
 * invariants (e.g. `RuntimeSandbox` / WebView isolation).
 */
import type { ComputedRef, Ref } from 'vue'
import {
  getConnectionRuntime,
  usePairedDevices,
  useSynraPluginEnvelope,
  type ConnectionRuntime,
  type PairedDeviceRow
} from '@synra/hooks'
import type { PluginClipboardHandle } from './clipboard'

// ─── Public types ────────────────────────────────────────────────────────────

export type UsePairedDevicesResult = {
  pairedDevices: ComputedRef<ReadonlyArray<PairedDeviceRow>>
  reloadPairedRecords(): Promise<void>
}

export type PluginSendRequest<T = unknown> = {
  target: string
  event: string
  payload: T
}

export type PluginBroadcastRequest<T = unknown> = {
  event: string
  payload: T
}

export type PluginFetchRequest = {
  input: string | URL
  init?: RequestInit
}

export type PluginReadFileRequest = {
  path: string
}

export type PluginBridgeOptions = {
  pluginId: string
  /**
   * Plugin's declared capability strings from `synra.capabilities` in
   * `package.json`. Surfaced on `bridge.capabilities` for UI display
   * and introspection; not used for any access control.
   */
  capabilities: ReadonlyArray<string>
  /**
   * Optional host-supplied clipboard handle. When omitted, calls to
   * `bridge.useClipboard()` throw a clear "not wired" error. The host
   * (`apps/frontend`) typically wires this to a thin adapter that
   * delegates to `@synra/capacitor-clipboard`'s `SynraClipboard.read` /
   * `SynraClipboard.write` so plugin code can use the OS clipboard on
   * every platform — Android WebView forbids `navigator.clipboard.writeText`
   * outside an explicit user gesture, which the v3 plugin-bridge response
   * path does not have.
   */
  clipboard?: PluginClipboardHandle
}

/** Return shape of `@synra/hooks#useSynraPluginEnvelope`. */
export type PluginEnvelopeHandle = ReturnType<typeof useSynraPluginEnvelope>

export type PluginBridge = {
  readonly pluginId: string
  /** Mirror of the plugin's declared `synra.capabilities`. Read-only; not enforced. */
  readonly capabilities: ReadonlyArray<string>

  // ── Host singleton state via closure ──
  usePairedDevices(): UsePairedDevicesResult
  useSynraPluginEnvelope(): PluginEnvelopeHandle
  /** Host-supplied clipboard handle (read/write OS clipboard). */
  useClipboard(): PluginClipboardHandle

  // ── Capability-free capability calls (trust boundary is the host runtime) ──
  send<T = unknown>(request: PluginSendRequest<T>): Promise<void>
  broadcast<T = unknown>(request: PluginBroadcastRequest<T>): Promise<void>
  fetch(request: PluginFetchRequest): Promise<Response>
  readFile(request: PluginReadFileRequest): Promise<string>

  /** Release any resources the bridge holds. Idempotent. */
  dispose(): void
}

// ─── Factory ─────────────────────────────────────────────────────────────────

/**
 * Create a per-plugin bridge. Each `enablePlugin` call in the host should
 * invoke this; the returned bridge should be `provide(SYNRA_BRIDGE_KEY, bridge)`
 * at the route level so any nested plugin component can
 * `inject(SYNRA_BRIDGE_KEY)` and get the same closure-bound surface.
 *
 * `usePairedDevices()` and `useSynraPluginEnvelope()` are the SAME
 * functions the host uses (re-exported from `@synra/hooks`); their
 * closures capture the host module singletons. The bridge only memoizes
 * the result per-plugin so multiple `bridge.useXxx()` calls share refs.
 */
export function createPluginBridge(options: PluginBridgeOptions): PluginBridge {
  // Validate the runtime is alive; failures here usually mean the host
  // activated a plugin before `configureHooksRuntime(...)` ran.
  const runtime = getConnectionRuntime() as ConnectionRuntime
  void runtime // referenced for clarity; the hooks close over it themselves
  const { pluginId, capabilities, clipboard: clipboardOption } = options

  // Cached hook so multiple `bridge.usePairedDevices()` calls share refs.
  let pairedDevicesCache: UsePairedDevicesResult | null = null
  function bridgeUsePairedDevices(): UsePairedDevicesResult {
    if (!pairedDevicesCache) {
      pairedDevicesCache = usePairedDevices()
    }
    return pairedDevicesCache
  }

  function bridgeUseClipboard(): PluginClipboardHandle {
    if (!clipboardOption) {
      throw new Error(
        `[synra] PluginBridge.useClipboard is not wired on the current host runtime. ` +
          `The host must pass \`clipboard\` to createPluginBridge(...) so plugin code can read/write ` +
          `the OS clipboard (the Android WebView's navigator.clipboard is permission-gated).`
      )
    }
    return clipboardOption
  }

  // Plugin envelope is created once so subscribe handlers + send share state.
  const slug = pluginId.startsWith('@synra-plugin/')
    ? pluginId.slice('@synra-plugin/'.length)
    : pluginId
  const envelope = useSynraPluginEnvelope(slug)

  let disposed = false

  async function send<T>(request: PluginSendRequest<T>): Promise<void> {
    await envelope.send({
      event: request.event,
      target: request.target,
      payload: request.payload
    })
  }

  async function broadcast<T>(request: PluginBroadcastRequest<T>): Promise<void> {
    // The native LAN transport (`DeviceConnectionPlugin.sendMessage` on
    // Android, `outbound-client-session.ts:sendLanEvent` on Electron)
    // routes frames by looking up the target as a concrete peer device
    // UUID. It has no special `*broadcast*` sentinel — passing that
    // string as the target falls through to `findInboundByDeviceId`,
    // returns `null`, and the call rejects with "Transport is not
    // open." So the fanout must happen here, on top of the unicast
    // transport: enumerate paired devices and emit one envelope per
    // device. Empty pair list → no-op (the plugin still sees an
    // awaited, non-rejecting call, so its UI doesn't surface a
    // confusing failure when nothing is paired yet).
    const paired = bridgeUsePairedDevices().pairedDevices.value
    const targets = paired
      .map((d) => d.deviceId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
    if (targets.length === 0) {
      return
    }
    await Promise.all(
      targets.map((target) =>
        envelope.send({
          event: request.event,
          target,
          payload: request.payload
        })
      )
    )
  }

  async function fetch(request: PluginFetchRequest): Promise<Response> {
    return globalThis.fetch(request.input, request.init)
  }

  async function readFile(request: PluginReadFileRequest): Promise<string> {
    const rt = runtime as unknown as {
      readFile?: (req: PluginReadFileRequest) => Promise<string>
    }
    if (typeof rt.readFile === 'function') {
      return rt.readFile(request)
    }
    throw new Error(`[synra] PluginBridge.readFile is not supported on the current host runtime.`)
  }

  function dispose(): void {
    if (disposed) {
      return
    }
    disposed = true
    // No listeners owned yet (subscribe handlers live in Vue onUnmounted); reserved.
  }

  return {
    pluginId,
    capabilities,
    usePairedDevices: bridgeUsePairedDevices,
    useSynraPluginEnvelope: () => envelope,
    useClipboard: bridgeUseClipboard,
    send,
    broadcast,
    fetch,
    readFile,
    dispose
  }
}

// Suppress unused import complaints under bundler tree-shaking.
void (null as unknown as Ref<unknown>)
void (null as unknown as ComputedRef<unknown>)
