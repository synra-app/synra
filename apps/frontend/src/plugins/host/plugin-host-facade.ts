import type { SynraPluginManifest, SynraUiManifestMetadata } from '@synra/plugin-sdk'
import type { Router } from 'vue-router'
import ChatPlugin from '@synra-plugin/chat'
import chatPackageJson from '@synra-plugin/chat/package.json'
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

  constructor() {
    this.registerBuiltinPlugin(
      registerBuiltinPluginFromManifest(chatPackageJson as SynraPluginManifest, new ChatPlugin())
    )
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
