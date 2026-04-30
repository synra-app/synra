import type { Router } from 'vue-router'
import type { SynraUiManifestMetadata } from '@synra/plugin-sdk'
import type { InstalledPluginSummary } from '@synra/capacitor-electron/protocol'
import type { PluginSyncReport, RegisteredPlugin } from './types'
import { PluginHostFacade } from './plugin-host-facade'

export type { RegisteredPlugin } from './types'
export { PluginHostFacade } from './plugin-host-facade'

const defaultHostFacade = new PluginHostFacade()

export function listPlugins(): SynraUiManifestMetadata[] {
  return defaultHostFacade.listPlugins()
}

export function registerPlugin(plugin: RegisteredPlugin): void {
  defaultHostFacade.registerPlugin(plugin)
}

export function syncInstalledPlugins(
  plugins: InstalledPluginSummary[],
  requestId?: string
): Promise<PluginSyncReport> {
  return defaultHostFacade.syncInstalledPlugins(plugins, requestId)
}

export function isPluginRegistered(pluginId: string): boolean {
  return defaultHostFacade.isPluginRegistered(pluginId)
}

export function activatePlugin(router: Router, pluginId: string): Promise<void> {
  return defaultHostFacade.activatePlugin(router, pluginId)
}

export function deactivatePlugin(router: Router, pluginId: string): Promise<void> {
  return defaultHostFacade.deactivatePlugin(router, pluginId)
}

export function unregisterInstalledPlugin(router: Router, pluginId: string): Promise<void> {
  return defaultHostFacade.unregisterInstalledPlugin(router, pluginId)
}

export function openPluginPage(
  router: Router,
  pluginId: string,
  pagePath: string,
  query?: Record<string, string>
): Promise<void> {
  return defaultHostFacade.openPluginPage(router, pluginId, pagePath, query)
}
