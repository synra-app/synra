import type { PluginCatalogRequestPayload } from '@synra/protocol'
import { parsePluginIdFromPackageName, type SynraActionPlugin } from '@synra/plugin-sdk'
import {
  createSynraPluginInstallStore,
  type SynraInstalledPluginRecord
} from '@synra/plugin-system/node'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { PluginCatalogResult } from '../../shared/protocol/types'
import type { PluginRuntimeService } from './plugin-runtime.service'

export type PluginCatalogService = {
  getCatalog(request?: PluginCatalogRequestPayload): Promise<PluginCatalogResult>
}

type PluginMetadata = {
  packageName?: string
  displayName?: string
  builtin?: boolean
  defaultPage?: string
  icon?: string
}

function getPluginMetadata(plugin: SynraActionPlugin): PluginMetadata | undefined {
  const pluginWithMeta = plugin as SynraActionPlugin & { meta?: PluginMetadata }
  return pluginWithMeta.meta
}

type CatalogPluginRecord = {
  pluginId: string
  packageName?: string
  version: string
  displayName: string
  status: 'installed' | 'available'
  builtin: boolean
  defaultPage: string
  icon?: string
}

function toCatalogPluginRecordFromInstalled(
  record: SynraInstalledPluginRecord
): CatalogPluginRecord {
  return {
    pluginId: record.pluginId,
    packageName: record.packageName,
    version: record.version,
    displayName: record.title,
    status: 'installed',
    builtin: record.builtin,
    defaultPage: record.defaultPage,
    icon: record.icon
  }
}

export function createPluginCatalogService(
  pluginRuntimeService: PluginRuntimeService,
  options: { installStorePath?: string } = {}
): PluginCatalogService {
  const installStorePath =
    options.installStorePath ?? join(homedir(), '.synra', 'plugins', 'installed.json')
  const installStore = createSynraPluginInstallStore(installStorePath)
  return {
    async getCatalog(request: PluginCatalogRequestPayload = {}): Promise<PluginCatalogResult> {
      const catalogMap = new Map<string, CatalogPluginRecord>()
      for (const record of installStore.list()) {
        catalogMap.set(record.pluginId, toCatalogPluginRecordFromInstalled(record))
      }

      for (const plugin of pluginRuntimeService.listPlugins()) {
        const metadata = getPluginMetadata(plugin)
        const packageName = metadata?.packageName
        const parsedPluginId = packageName ? parsePluginIdFromPackageName(packageName) : null
        const pluginId = parsedPluginId ?? plugin.id
        catalogMap.set(pluginId, {
          pluginId,
          packageName,
          version: plugin.version,
          displayName: metadata?.displayName ?? plugin.id,
          status: 'installed',
          builtin: metadata?.builtin ?? false,
          defaultPage: metadata?.defaultPage ?? 'home',
          icon: metadata?.icon
        })
      }

      const known = new Set(request.knownPluginIds ?? [])
      const plugins = [...catalogMap.values()]
        .filter((plugin) => !known.has(plugin.pluginId))
        .map((plugin) => ({
          pluginId: plugin.pluginId,
          packageName: plugin.packageName,
          version: plugin.version,
          displayName: plugin.displayName,
          status: plugin.status,
          builtin: plugin.builtin,
          defaultPage: plugin.defaultPage,
          icon: plugin.icon
        }))

      return {
        plugins,
        generatedAt: Date.now()
      }
    }
  }
}
