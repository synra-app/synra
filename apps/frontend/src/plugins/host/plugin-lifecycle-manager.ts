import {
  createPluginBridge,
  type PluginBridge,
  type SynraUiManifestMetadata
} from '@synra/plugin-sdk'
import type { Router } from 'vue-router'
import type { PluginRuntimeState } from './types'
import { PluginRegistry } from './plugin-registry'
import { PluginRouteBinder } from './plugin-route-binder'

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
    const bridge = createPluginBridge({ pluginId, capabilities })
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
