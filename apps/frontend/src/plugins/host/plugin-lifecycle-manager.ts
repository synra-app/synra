import type { SynraUiManifestMetadata } from '@synra/plugin-sdk'
import type { Router } from 'vue-router'
import { loadBuiltinSynraPluginStylesOnce } from './builtin-plugin-loaders'
import type { PluginRuntimeState } from './types'
import { PluginRegistry } from './plugin-registry'
import { PluginRouteBinder } from './plugin-route-binder'

export class PluginLifecycleManager {
  private readonly pluginStates = new Map<string, PluginRuntimeState>()

  constructor(
    private readonly registry: PluginRegistry,
    private readonly routeBinder: PluginRouteBinder,
    private readonly metadataByPluginId: ReadonlyMap<string, SynraUiManifestMetadata>
  ) {}

  resolveState(pluginId: string): PluginRuntimeState {
    return this.pluginStates.get(pluginId) ?? 'idle'
  }

  async activate(router: Router, pluginId: string): Promise<void> {
    const plugin = this.registry.get(pluginId)
    if (!plugin) {
      throw new Error(`Plugin '${pluginId}' is not registered.`)
    }
    if (this.resolveState(pluginId) === 'active') {
      return
    }
    const metadata = this.metadataByPluginId.get(pluginId)
    if (!metadata) {
      throw new Error(`Plugin '${pluginId}' metadata is not registered.`)
    }
    this.pluginStates.set(pluginId, 'entering')
    await loadBuiltinSynraPluginStylesOnce(metadata.packageName)
    await plugin.onPluginEnter()
    this.routeBinder.attachRoutes(router, pluginId, metadata.packageName)
    this.pluginStates.set(pluginId, 'active')
  }

  async deactivate(router: Router, pluginId: string): Promise<void> {
    const plugin = this.registry.get(pluginId)
    if (!plugin || this.resolveState(pluginId) !== 'active') {
      return
    }
    this.pluginStates.set(pluginId, 'exiting')
    await plugin.onPluginExit()
    this.routeBinder.detachRoutes(router, pluginId)
    this.pluginStates.set(pluginId, 'idle')
  }
}
