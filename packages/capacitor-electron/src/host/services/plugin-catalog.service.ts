import type { PluginCatalogRequestPayload } from '@synra/protocol'
import {
  getSynraUiManifestMetadata,
  parsePluginIdFromPackageName,
  type SynraActionPlugin,
  type SynraPluginManifest
} from '@synra/plugin-sdk'
import chatPackageJson from '@synra-plugin/chat/package.json'
import type { PluginCatalogResult } from '../../shared/protocol/types'
import type { PluginRuntimeService } from './plugin-runtime.service'

export type PluginCatalogService = {
  getCatalog(request?: PluginCatalogRequestPayload): Promise<PluginCatalogResult>
}

const chatPluginManifest = chatPackageJson as SynraPluginManifest

type PluginMetadata = {
  packageName?: string
  displayName?: string
  builtin?: boolean
  defaultPage?: string
  icon?: string
  manifest?: SynraPluginManifest
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

function toCatalogPluginRecordFromManifest(manifest: SynraPluginManifest): CatalogPluginRecord {
  const metadata = getSynraUiManifestMetadata(manifest)
  return {
    pluginId: metadata.pluginId,
    packageName: metadata.packageName,
    version: metadata.version,
    displayName: metadata.title,
    status: 'installed',
    builtin: metadata.builtin,
    defaultPage: metadata.defaultPage,
    icon: metadata.icon
  }
}

function readManifestMetadata(
  manifest?: SynraPluginManifest
): ReturnType<typeof getSynraUiManifestMetadata> | undefined {
  if (!manifest) {
    return undefined
  }

  try {
    return getSynraUiManifestMetadata(manifest)
  } catch {
    return undefined
  }
}

export function createPluginCatalogService(
  pluginRuntimeService: PluginRuntimeService
): PluginCatalogService {
  return {
    async getCatalog(request: PluginCatalogRequestPayload = {}): Promise<PluginCatalogResult> {
      const catalogMap = new Map<string, CatalogPluginRecord>(
        [toCatalogPluginRecordFromManifest(chatPluginManifest)].map(
          (item) => [item.pluginId, item] as const
        )
      )

      for (const plugin of pluginRuntimeService.listPlugins()) {
        const metadata = getPluginMetadata(plugin)
        const manifestMetadata = readManifestMetadata(metadata?.manifest)
        const packageName = manifestMetadata?.packageName ?? metadata?.packageName
        const parsedPluginId = packageName ? parsePluginIdFromPackageName(packageName) : null
        const pluginId = manifestMetadata?.pluginId ?? parsedPluginId ?? plugin.id
        catalogMap.set(pluginId, {
          pluginId,
          packageName,
          version: manifestMetadata?.version ?? plugin.version,
          displayName: metadata?.displayName ?? manifestMetadata?.title ?? plugin.id,
          status: 'installed',
          builtin: manifestMetadata?.builtin ?? metadata?.builtin ?? false,
          defaultPage: manifestMetadata?.defaultPage ?? metadata?.defaultPage ?? 'home',
          icon: manifestMetadata?.icon ?? metadata?.icon
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
