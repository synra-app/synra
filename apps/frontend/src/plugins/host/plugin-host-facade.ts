import type { SynraUiManifestMetadata } from '@synra/plugin-sdk'
import type { Router } from 'vue-router'
import {
  discoverBuiltinSynraUiPluginPackages,
  loadBuiltinSynraPluginEntry
} from './builtin-plugin-loaders'
import type { RegisteredBuiltinPlugin } from './types'
import { registerBuiltinPluginFromManifest } from './register-builtin-from-manifest'
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

  private builtinPluginsInit: Promise<void> | null = null

  /**
   * Discovers `@synra-plugin/*` packages under node_modules, dynamically imports each
   * entry + manifest, and registers builtins. Idempotent.
   */
  initializeBuiltinPlugins(): Promise<void> {
    if (this.builtinPluginsInit) {
      return this.builtinPluginsInit
    }
    this.builtinPluginsInit = (async () => {
      for (const { packageName, manifest } of discoverBuiltinSynraUiPluginPackages()) {
        const PluginCtor = await loadBuiltinSynraPluginEntry(packageName)
        this.registerBuiltinPlugin(registerBuiltinPluginFromManifest(manifest, new PluginCtor()))
      }
    })()
    return this.builtinPluginsInit
  }

  listBuiltinPlugins(): SynraUiManifestMetadata[] {
    return this.registry.list()
  }

  registerBuiltinPlugin(plugin: RegisteredBuiltinPlugin): void {
    this.registry.register(plugin)
    this.metadataByPluginId.set(plugin.metadata.pluginId, plugin.metadata)
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
}
