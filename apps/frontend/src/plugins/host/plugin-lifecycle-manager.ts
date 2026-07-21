import {
  createPluginBridge,
  type PluginBridge,
  type PluginClipboardHandle,
  type PluginPreferencesHandle,
  type SynraUiManifestMetadata
} from '@synra/plugin-sdk'
import { SynraClipboard } from '@synra/capacitor-clipboard'
import { SynraPreferences } from '@synra/capacitor-preferences'
import type { Router } from 'vue-router'
import type { PluginRuntimeState } from './types'
import { PluginRegistry } from './plugin-registry'
import { PluginRouteBinder } from './plugin-route-binder'

/**
 * Thin adapter from `@synra/capacitor-clipboard`'s `SynraClipboard`
 * plugin to the `PluginClipboardHandle` shape that `PluginBridge`
 * exposes. We pass this into every `createPluginBridge(...)` call so
 * any v3 plugin can call `bridge.useClipboard().writeText(text)` and
 * have it land on the host OS clipboard — sidestepping the Android
 * WebView's `navigator.clipboard.writeText` permission gate.
 *
 * Built lazily via a memoized factory so repeated `bridge.useClipboard()`
 * calls share the same handle (and the same `SynraClipboard` proxy)
 * across every plugin instance. Module-load construction is fine too,
 * but the lazy path keeps tests free to override `SynraClipboard.read`
 * by simply not invoking the factory until needed.
 */
function createHostClipboardHandle(): PluginClipboardHandle {
  return {
    async readText(): Promise<string> {
      const result = await SynraClipboard.read()
      return result.text
    },
    async writeText(text: string): Promise<void> {
      await SynraClipboard.write({ text })
    }
  }
}

let hostClipboardHandleCache: PluginClipboardHandle | null = null
function getHostClipboardHandle(): PluginClipboardHandle {
  if (!hostClipboardHandleCache) {
    hostClipboardHandleCache = createHostClipboardHandle()
  }
  return hostClipboardHandleCache
}

/**
 * Thin adapter from `@synra/capacitor-preferences`'s `SynraPreferences`
 * plugin object to the `PluginPreferencesHandle` shape that
 * `PluginBridge` exposes. Plugins never import
 * `@synra/capacitor-preferences` directly — they call
 * `bridge.usePreferences().get(key)` / `set(key, value)` / `remove(key)`
 * and the host routes to the native Capacitor preferences plugin on
 * Android / iOS, or to the Electron-side `preferences.*` IPC bridge
 * on Electron (which lands in `~/.synra/synra-preferences-store.json`).
 *
 * Built lazily via a memoized factory so repeated
 * `bridge.usePreferences()` calls share the same handle (and the same
 * `SynraPreferences` proxy) across every plugin instance.
 */
function createHostPreferencesHandle(): PluginPreferencesHandle {
  return {
    async get(key: string): Promise<string | null> {
      const result = await SynraPreferences.get({ key })
      return result.value ?? null
    },
    async set(key: string, value: string): Promise<void> {
      await SynraPreferences.set({ key, value })
    },
    async remove(key: string): Promise<void> {
      await SynraPreferences.remove({ key })
    }
  }
}

let hostPreferencesHandleCache: PluginPreferencesHandle | null = null
function getHostPreferencesHandle(): PluginPreferencesHandle {
  if (!hostPreferencesHandleCache) {
    hostPreferencesHandleCache = createHostPreferencesHandle()
  }
  return hostPreferencesHandleCache
}

/**
 * Owns the lifecycle of plugin bridges (one per plugin). The bridge is
 * the v3 redesign's keystone: it is a closure-bound surface that any
 * nested plugin Vue component can `inject(SYNRA_BRIDGE_KEY)` to obtain.
 * The bridge closes over host singletons (`pairedDevicesStorageEpoch`,
 * `getConnectionRuntime()`), so plugin reactivity stays in sync with
 * host state without an importmap.
 *
 * v3 no longer relies on the plugin's `onPluginEnter`/`onPluginExit`
 * lifecycle hooks for state sharing — they are reserved for future
 * background work (e.g. spawning plugin-owned workers).
 */
export class PluginLifecycleManager {
  private readonly pluginStates = new Map<string, PluginRuntimeState>()
  private readonly bridgesByPluginId = new Map<string, PluginBridge>()

  constructor(
    private readonly registry: PluginRegistry,
    private readonly routeBinder: PluginRouteBinder,
    private readonly metadataByPluginId: ReadonlyMap<string, SynraUiManifestMetadata>
  ) {}

  resolveState(pluginId: string): PluginRuntimeState {
    return this.pluginStates.get(pluginId) ?? 'idle'
  }

  async activate(router: Router, pluginId: string, artifactRoot?: string): Promise<void> {
    const pluginRecord = this.registry.getRecord(pluginId)
    if (!pluginRecord) {
      throw new Error(`Plugin '${pluginId}' registration record is missing.`)
    }
    if (this.resolveState(pluginId) === 'active') {
      return
    }
    const metadata = this.metadataByPluginId.get(pluginId)
    if (!metadata) {
      throw new Error(`Plugin '${pluginId}' metadata is not registered.`)
    }
    this.pluginStates.set(pluginId, 'entering')

    // Build the bridge once per activate; the binder holds it so the
    // lazy loader can `provide(SYNRA_BRIDGE_KEY, bridge)` at navigation time.
    const capabilities = metadata.capabilities ?? []
    const bridge = createPluginBridge({
      pluginId,
      capabilities,
      clipboard: getHostClipboardHandle(),
      preferences: getHostPreferencesHandle()
    })
    this.bridgesByPluginId.set(pluginId, bridge)
    this.routeBinder.setBridge(pluginId, bridge)

    // Reserved lifecycle hook — currently a no-op since the plugin
    // class isn't instantiated by the host. Kept as try/catch so a
    // misbehaving subclass doesn't break activation.
    try {
      const plugin = this.registry.get(pluginId)
      await plugin?.onPluginEnter?.()
    } catch {
      // Swallow; the host continues even if a subclass throws.
    }

    await this.routeBinder.attachRoutes(
      router,
      pluginId,
      artifactRoot ?? pluginRecord.artifactRoot,
      metadata.defaultPage,
      metadata.entries?.ui
    )
    this.pluginStates.set(pluginId, 'active')
  }

  async deactivate(router: Router, pluginId: string): Promise<void> {
    if (this.resolveState(pluginId) !== 'active') {
      return
    }
    this.pluginStates.set(pluginId, 'exiting')
    try {
      const plugin = this.registry.get(pluginId)
      await plugin?.onPluginExit?.()
    } catch {
      // Swallow.
    }
    this.routeBinder.detachRoutes(router, pluginId)
    this.routeBinder.clearBridge(pluginId)
    const bridge = this.bridgesByPluginId.get(pluginId)
    bridge?.dispose()
    this.bridgesByPluginId.delete(pluginId)
    this.pluginStates.set(pluginId, 'idle')
  }
}
