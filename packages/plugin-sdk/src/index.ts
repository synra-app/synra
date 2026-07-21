/**
 * @synra/plugin-sdk — public surface.
 *
 * v3 redesign (see `ai-docs/plugin-system/09-runtime-redesign.md`):
 *   - This package is now types-only for plugin authors. The only runtime
 *     export is `createPluginBridge`, which is consumed by the HOST (the
 *     monorepo's `apps/frontend`), never by a plugin bundle.
 *   - Plugin bundles import only `import type { ... } from '@synra/plugin-sdk'`;
 *     TypeScript erases these imports so the bundle ships zero bare
 *     specifiers and works in any host (Electron, web, Android WebView).
 *   - The host `provide(SYNRA_BRIDGE_KEY, bridge)` at the plugin route so
 *     that any nested plugin component can `inject(SYNRA_BRIDGE_KEY)` and
 *     call `bridge.send(...)`, `bridge.usePairedDevices()`, etc.
 */
import type { SynraActionReceipt, SynraActionRequest } from '@synra/protocol'
import {
  getSynraPluginManifestMetadata,
  parsePluginIdFromPackageName,
  type SynraPluginManifest,
  type SynraPluginManifestEntries,
  type SynraPluginManifestMetadata
} from '@synra/plugin-system'

// ─── Plugin lifecycle abstract class ─────────────────────────────────────────

/**
 * Optional base class for plugin lifecycle hooks. Host currently does NOT
 * call `onPluginEnter`/`onPluginExit` (state sharing happens via the
 * `PluginBridge`), but reserved for future use (e.g., background scans,
 * graceful shutdown of plugin-spawned workers).
 */
export abstract class SynraPlugin {
  onPluginEnter(): void | Promise<void> {}
  onPluginExit(): void | Promise<void> {}
}

// ─── Plugin manifest metadata (host-facing utility) ──────────────────────────

export type ShareInputType = 'text' | 'url' | 'file'

export type ShareInput = {
  type: ShareInputType
  raw: string
  metadata?: Record<string, unknown>
}

export type PluginMatchResult = {
  matched: boolean
  score: number
  reason?: string
}

export type PluginAction = SynraActionRequest & {
  label: string
  requiresConfirm: boolean
}

export type ExecuteContext = {
  deviceId: string
  traceId: string
}

export type SynraActionPlugin = {
  id: string
  version: string
  meta?: {
    packageName?: string
    displayName?: string
    builtin?: boolean
    defaultPage?: string
    icon?: string
    manifest?: SynraPluginManifest
  }
  supports(input: ShareInput): Promise<PluginMatchResult>
  buildActions(input: ShareInput): Promise<PluginAction[]>
  execute(action: PluginAction, context: ExecuteContext): Promise<SynraActionReceipt>
}

export type SynraUiManifestMetadata = SynraPluginManifestMetadata

/** Build host UI metadata from a raw `synra.*` manifest. Used by the host facade. */
export function getSynraUiManifestMetadata(
  manifest: SynraPluginManifest
): SynraPluginManifestMetadata {
  return getSynraPluginManifestMetadata(manifest)
}

export function getSynraPluginMetaFromManifest(
  manifest: SynraPluginManifest
): NonNullable<SynraActionPlugin['meta']> {
  const metadata = getSynraUiManifestMetadata(manifest)
  return {
    packageName: metadata.packageName,
    displayName: metadata.title,
    builtin: metadata.builtin,
    defaultPage: metadata.defaultPage,
    icon: metadata.icon,
    manifest
  }
}

// ─── Plugin bridge (provided/injected; host-only runtime export) ─────────────

export const SYNRA_BRIDGE_KEY: unique symbol = Symbol.for('synra.plugin.bridge')

export {
  createPluginBridge,
  type PluginBridge,
  type PluginBridgeOptions,
  type PluginEnvelopeHandle,
  type UsePairedDevicesResult,
  type PluginSendRequest,
  type PluginBroadcastRequest,
  type PluginFetchRequest,
  type PluginReadFileRequest
} from './plugin-bridge'
export { type PluginClipboardHandle } from './clipboard'

// ─── Page path helpers (used by host + plugins; pure functions, no runtime) ──

export { normalizePluginPagePath, pluginFilePathToPagePath } from './page-path'

// ─── Host-side runtime helpers (small, plugin-bundle-friendly) ──────────────
//
// Tiny runtime helpers that plugin authors reach for but that don't
// deserve their own package: cross-platform host detection and the
// renderer-side Electron preload bridge shape. The full
// `createPluginBridge` contract remains the only "heavy" runtime
// export; these are pure leaf utilities that bundlers tree-shake
// when unused.
export {
  detectHostRuntime,
  getElectronBridgeInvoker,
  type HostRuntime,
  type PreloadBridgeApi,
  type PreloadBridgeInvoke
} from './host-utils'

// ─── Worker client (composer pattern; reserved for future use) ───────────────

export type {
  PluginWorkerActionInvokeInput,
  PluginWorkerClient,
  PluginWorkerRuntime,
  PluginWorkerTaskRequest,
  PluginWorkerTaskResult,
  LocalTaskExecutor,
  WorkerRuntimeOptions
} from './worker-runtime'
export {
  createPluginWorkerClient,
  disposePluginWorker,
  FallbackWorkerRuntime,
  invokePluginAction,
  WorkerProxyRuntime
} from './worker-runtime'

// ─── Re-exports ──────────────────────────────────────────────────────────────

export type { SynraPluginManifest, SynraPluginManifestEntries }
export { parsePluginIdFromPackageName }
