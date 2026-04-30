import { Capacitor } from '@capacitor/core'
import type { SynraUiManifestMetadata } from '@synra/plugin-sdk'
import type { Router } from 'vue-router'
import type { PluginRuntimeState } from './types'
import { PluginRegistry } from './plugin-registry'
import { PluginRouteBinder } from './plugin-route-binder'
import { toPluginAssetUrl } from './plugin-asset-url'

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
    this.injectInstalledPluginStyleOnce(pluginId, pluginRecord.artifactRoot)
    await plugin.onPluginEnter()
    await this.routeBinder.attachRoutes(
      router,
      pluginId,
      pluginRecord.artifactRoot,
      metadata.defaultPage,
      metadata.entries?.ui
    )
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

  private injectInstalledPluginStyleOnce(pluginId: string, artifactRoot?: string): void {
    if (!artifactRoot) {
      return
    }
    if (
      typeof window !== 'undefined' &&
      Capacitor.isNativePlatform() &&
      !window.__synraCapElectron?.invoke
    ) {
      return
    }
    const stylePaths = [
      toPluginAssetUrl(pluginId, 'dist/style.css'),
      toPluginAssetUrl(pluginId, 'dist/ui/style.css')
    ]
    if (stylePaths.some((path) => this.loadedStylePaths.has(path))) {
      return
    }
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    let currentPath: string | null = null
    link.addEventListener(
      'load',
      () => {
        if (currentPath) {
          this.loadedStylePaths.add(currentPath)
        }
      },
      { once: false }
    )
    let index = 0
    const tryNext = (): void => {
      if (index >= stylePaths.length) {
        return
      }
      currentPath = stylePaths[index]
      link.href = currentPath
      index += 1
    }
    link.addEventListener(
      'error',
      () => {
        tryNext()
      },
      { once: false }
    )
    tryNext()
    document.head.appendChild(link)
  }
}
