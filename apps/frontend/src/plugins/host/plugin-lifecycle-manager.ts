import type { SynraUiManifestMetadata } from '@synra/plugin-sdk'
import type { Router } from 'vue-router'
import type { PluginRuntimeState } from './types'
import { PluginRegistry } from './plugin-registry'
import { PluginRouteBinder } from './plugin-route-binder'

export class PluginLifecycleManager {
  private readonly pluginStates = new Map<string, PluginRuntimeState>()
  private readonly loadedStylePaths = new Set<string>()

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
    this.injectInstalledPluginStyleOnce(pluginRecord.artifactRoot)
    await plugin.onPluginEnter()
    await this.routeBinder.attachRoutes(router, pluginId, pluginRecord.artifactRoot)
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

  private injectInstalledPluginStyleOnce(artifactRoot?: string): void {
    if (!artifactRoot) {
      return
    }
    const normalizedRoot = artifactRoot.replace(/\\/g, '/')
    const stylePath = `${normalizedRoot}/package/dist/ui/style.css`
    if (this.loadedStylePaths.has(stylePath)) {
      return
    }
    const href = this.toFileUrl(stylePath)
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = href
    document.head.appendChild(link)
    this.loadedStylePaths.add(stylePath)
  }

  private toFileUrl(filePath: string): string {
    const normalized = filePath.replace(/\\/g, '/')
    if (/^[a-zA-Z]:\//.test(normalized)) {
      return `file:///${normalized}`
    }
    return `file://${normalized}`
  }
}
