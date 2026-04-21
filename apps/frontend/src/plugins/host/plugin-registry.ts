import type { SynraPlugin, SynraUiManifestMetadata } from '@synra/plugin-sdk'
import type { RegisteredBuiltinPlugin } from './types'

export class PluginRegistry {
  private readonly plugins = new Map<string, SynraPlugin>()
  private readonly metadataByPluginId = new Map<string, SynraUiManifestMetadata>()

  constructor(initialPlugins: RegisteredBuiltinPlugin[] = []) {
    for (const plugin of initialPlugins) {
      this.plugins.set(plugin.metadata.pluginId, plugin.plugin)
      this.metadataByPluginId.set(plugin.metadata.pluginId, plugin.metadata)
    }
  }

  list(): SynraUiManifestMetadata[] {
    return [...this.metadataByPluginId.values()]
  }

  register(plugin: RegisteredBuiltinPlugin): void {
    this.plugins.set(plugin.metadata.pluginId, plugin.plugin)
    this.metadataByPluginId.set(plugin.metadata.pluginId, plugin.metadata)
  }

  get(pluginId: string): SynraPlugin | undefined {
    return this.plugins.get(pluginId)
  }
}
