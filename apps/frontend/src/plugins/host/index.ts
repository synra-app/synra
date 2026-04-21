import type { Router } from 'vue-router'
import type { SynraUiManifestMetadata } from '@synra/plugin-sdk'
import type { RegisteredBuiltinPlugin } from './types'
import { PluginHostFacade } from './plugin-host-facade'

export type { RegisteredBuiltinPlugin } from './types'
export { PluginHostFacade } from './plugin-host-facade'

const defaultHostFacade = new PluginHostFacade()

export function listBuiltinPlugins(): SynraUiManifestMetadata[] {
  return defaultHostFacade.listBuiltinPlugins()
}

export function registerBuiltinPlugin(plugin: RegisteredBuiltinPlugin): void {
  defaultHostFacade.registerBuiltinPlugin(plugin)
}

export function activatePlugin(router: Router, pluginId: string): Promise<void> {
  return defaultHostFacade.activatePlugin(router, pluginId)
}

export function deactivatePlugin(router: Router, pluginId: string): Promise<void> {
  return defaultHostFacade.deactivatePlugin(router, pluginId)
}

export function openPluginPage(
  router: Router,
  pluginId: string,
  pagePath: string,
  query?: Record<string, string>
): Promise<void> {
  return defaultHostFacade.openPluginPage(router, pluginId, pagePath, query)
}
