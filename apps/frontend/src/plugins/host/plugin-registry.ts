import type { SynraPlugin, SynraUiManifestMetadata } from '@synra/plugin-sdk'
import type { RegisteredPlugin } from './types'

export class PluginRegistry {
  private readonly plugins = new Map<string, RegisteredPlugin>()

  constructor(initialPlugins: RegisteredPlugin[] = []) {
    for (const record of initialPlugins) {
      this.plugins.set(record.metadata.pluginId, record)
    }
  }

  list(): SynraUiManifestMetadata[] {
    return [...this.plugins.values()].map((record) => record.metadata)
  }

  register(record: RegisteredPlugin): void {
    this.plugins.set(record.metadata.pluginId, record)
  }

  unregister(pluginId: string): void {
    this.plugins.delete(pluginId)
  }

  get(pluginId: string): SynraPlugin | undefined {
    return this.plugins.get(pluginId)?.plugin
  }

  getRecord(pluginId: string): RegisteredPlugin | undefined {
    return this.plugins.get(pluginId)
  }
}
