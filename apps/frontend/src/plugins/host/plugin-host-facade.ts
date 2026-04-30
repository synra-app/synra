import type { SynraUiManifestMetadata } from '@synra/plugin-sdk'
import { getSynraUiManifestMetadata, type SynraPluginManifest } from '@synra/plugin-sdk'
import { createElectronBridgePluginFromGlobal } from '@synra/capacitor-electron/plugin'
import type { Router } from 'vue-router'
import type { InstalledPluginSummary } from '@synra/capacitor-electron'
import type {
  PluginSyncFailure,
  PluginSyncReport,
  RegisteredPlugin,
  PluginSyncFailureKind
} from './types'
import { PluginRegistry } from './plugin-registry'
import { PluginRouteBinder } from './plugin-route-binder'
import { PluginLifecycleManager } from './plugin-lifecycle-manager'

export class PluginHostFacade {
  private readonly registry = new PluginRegistry()
  private readonly metadataByPluginId = new Map<string, SynraUiManifestMetadata>()
  private readonly routeBinder = new PluginRouteBinder()
  private readonly lifecycle = new PluginLifecycleManager(
    this.registry,
    this.routeBinder,
    this.metadataByPluginId
  )

  listPlugins(): SynraUiManifestMetadata[] {
    return this.registry.list()
  }

  registerPlugin(plugin: RegisteredPlugin): void {
    this.registry.register(plugin)
    this.metadataByPluginId.set(plugin.metadata.pluginId, plugin.metadata)
  }

  async syncInstalledPlugins(
    plugins: InstalledPluginSummary[],
    requestId?: string
  ): Promise<PluginSyncReport> {
    const registeredPluginIds: string[] = []
    const failedPlugins: PluginSyncFailure[] = []
    const byPluginId = new Map<string, InstalledPluginSummary>()
    for (const plugin of plugins) {
      byPluginId.set(plugin.pluginId, plugin)
    }
    if (!window.__synraCapElectron?.invoke) {
      return {
        registeredPluginIds,
        failedPlugins
      }
    }
    const bridge = createElectronBridgePluginFromGlobal()
    const registerReport = await bridge.registerInstalledPlugins({ plugins, requestId })
    for (const pluginId of registerReport.registeredPluginIds) {
      const plugin = byPluginId.get(pluginId)
      if (!plugin) {
        continue
      }
      const metadata = this.toMetadata(plugin)
      if (this.registry.get(metadata.pluginId)) {
        registeredPluginIds.push(metadata.pluginId)
        continue
      }
      this.registerPlugin({
        plugin: this.createNoopPlugin(),
        metadata,
        artifactRoot: plugin.artifactRoot
      })
      registeredPluginIds.push(metadata.pluginId)
    }
    for (const failed of registerReport.failedPlugins) {
      failedPlugins.push({
        pluginId: failed.pluginId,
        reason: failed.reason as PluginSyncFailureKind,
        message: failed.message,
        cleanupRecommended: failed.cleanupRecommended
      })
    }
    return {
      registeredPluginIds,
      failedPlugins
    }
  }

  isPluginRegistered(pluginId: string): boolean {
    return Boolean(this.registry.get(pluginId))
  }

  activatePlugin(router: Router, pluginId: string): Promise<void> {
    return this.lifecycle.activate(router, pluginId)
  }

  deactivatePlugin(router: Router, pluginId: string): Promise<void> {
    return this.lifecycle.deactivate(router, pluginId)
  }

  async openPluginPage(
    router: Router,
    pluginId: string,
    pagePath: string,
    query?: Record<string, string>
  ): Promise<void> {
    await this.activatePlugin(router, pluginId)
    await router.push({
      path: this.routeBinder.resolveRuntimePath(pluginId, pagePath),
      query
    })
  }

  private toMetadata(plugin: InstalledPluginSummary): SynraUiManifestMetadata {
    const manifest: SynraPluginManifest = {
      name: plugin.packageName,
      version: plugin.version,
      synra: {
        title: plugin.title,
        defaultPage: plugin.defaultPage,
        icon: plugin.icon,
        builtin: plugin.builtin,
        entries: plugin.entries
      }
    }
    return getSynraUiManifestMetadata(manifest)
  }

  private createNoopPlugin(): RegisteredPlugin['plugin'] {
    return {
      async onPluginEnter(): Promise<void> {},
      async onPluginExit(): Promise<void> {}
    }
  }
}
