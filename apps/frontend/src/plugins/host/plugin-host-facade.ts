import type { SynraUiManifestMetadata } from '@synra/plugin-sdk'
import { getSynraUiManifestMetadata, type SynraPluginManifest } from '@synra/plugin-sdk'
import { resolveSynraPluginUiEntryAbsolutePath } from '@synra/plugin-system'
import type { Router } from 'vue-router'
import type { InstalledPluginSummary } from '@synra/capacitor-electron'
import type { RegisteredPlugin } from './types'
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

  async syncInstalledPlugins(plugins: InstalledPluginSummary[]): Promise<void> {
    for (const plugin of plugins) {
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
      const metadata = getSynraUiManifestMetadata(manifest)
      if (this.registry.get(metadata.pluginId)) {
        continue
      }

      const uiEntryPath = resolveSynraPluginUiEntryAbsolutePath(plugin.artifactRoot, plugin.entries)
      const imported = await import(/* @vite-ignore */ this.toFileModuleUrl(uiEntryPath))
      const PluginCtor = imported.default as (new () => RegisteredPlugin['plugin']) | undefined
      if (typeof PluginCtor !== 'function') {
        continue
      }
      this.registerPlugin({
        plugin: new PluginCtor(),
        metadata,
        artifactRoot: plugin.artifactRoot
      })
    }
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

  private toFileModuleUrl(filePath: string): string {
    const normalized = filePath.replace(/\\/g, '/')
    if (/^[a-zA-Z]:\//.test(normalized)) {
      return `file:///${normalized}`
    }
    return `file://${normalized}`
  }
}
