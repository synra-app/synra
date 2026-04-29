import type { PluginCatalogRequestPayload } from '@synra/protocol'
import { parsePluginIdFromPackageName, type SynraActionPlugin } from '@synra/plugin-sdk'
import {
  getSynraPluginManifestMetadata,
  isValidSynraPluginPackageName,
  type SynraPluginManifest
} from '@synra/plugin-system'
import {
  createSynraPluginInstallStore,
  type SynraInstalledPluginRecord
} from '@synra/plugin-system/node'
import { homedir } from 'node:os'
import { join } from 'pathe'
import type { PluginCatalogResult } from '../../shared/protocol/types'
import type { PluginRuntimeService } from './plugin-runtime.service'

type CatalogPluginRecord = {
  pluginId: string
  packageName?: string
  version: string
  displayName: string
  status: 'installed' | 'available'
  builtin: boolean
  defaultPage: string
  icon?: string
  entries?: SynraInstalledPluginRecord['entries']
}

type NpmPackageVersionDoc = {
  name: string
  version: string
  synra?: SynraPluginManifest['synra']
}

type NpmPackageMetadataDoc = {
  name: string
  'dist-tags'?: Record<string, string>
  versions?: Record<string, NpmPackageVersionDoc>
}

function resolveDefaultRegistryUrl(): string {
  return process.env.SYNRA_PLUGIN_REGISTRY_URL?.trim() || 'https://registry.npmjs.org'
}

function normalizeRegistryUrlForCatalog(): string {
  return resolveDefaultRegistryUrl().replace(/\/+$/, '')
}

async function fetchNpmPackageMetadata(
  registryUrl: string,
  packageName: string
): Promise<NpmPackageMetadataDoc | null> {
  try {
    const response = await fetch(`${registryUrl}/${encodeURIComponent(packageName)}`)
    if (!response.ok) {
      return null
    }
    return (await response.json()) as NpmPackageMetadataDoc
  } catch {
    return null
  }
}

function toManifestFromNpmVersionDoc(doc: NpmPackageVersionDoc): SynraPluginManifest {
  return {
    name: doc.name,
    version: doc.version,
    synra: doc.synra
  }
}

/**
 * Merges registry metadata for a user query (full package name or keyword dual lookup).
 * See ai-docs/plugin-system/02-discovery-and-catalog.md.
 */
async function mergeRegistryQueryIntoCatalog(
  catalogMap: Map<string, CatalogPluginRecord>,
  queryRaw: string | undefined,
  registryUrl: string
): Promise<void> {
  const trimmed = queryRaw?.trim() ?? ''
  if (!trimmed) {
    return
  }

  const packageNames: string[] = []
  if (isValidSynraPluginPackageName(trimmed)) {
    packageNames.push(trimmed)
  } else {
    const slug = trimmed.replace(/[^a-z0-9-]/gi, '').toLowerCase()
    if (!slug) {
      return
    }
    packageNames.push(`@synra-plugin/${slug}`, `synra-plugin-${slug}`)
  }

  for (const packageName of packageNames) {
    const meta = await fetchNpmPackageMetadata(registryUrl, packageName)
    if (!meta) {
      continue
    }
    const resolvedVersion = meta['dist-tags']?.latest
    if (!resolvedVersion) {
      continue
    }
    const versionDoc = meta.versions?.[resolvedVersion]
    if (!versionDoc) {
      continue
    }

    let manifestMetadata
    try {
      manifestMetadata = getSynraPluginManifestMetadata(toManifestFromNpmVersionDoc(versionDoc))
    } catch {
      continue
    }

    if (catalogMap.has(manifestMetadata.pluginId)) {
      continue
    }

    catalogMap.set(manifestMetadata.pluginId, {
      pluginId: manifestMetadata.pluginId,
      packageName: manifestMetadata.packageName,
      version: manifestMetadata.version,
      displayName: manifestMetadata.title,
      status: 'available',
      builtin: manifestMetadata.builtin,
      defaultPage: manifestMetadata.defaultPage,
      icon: manifestMetadata.icon,
      entries: manifestMetadata.entries
    })
  }
}

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
    icon: record.icon,
    entries: record.entries
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

      await mergeRegistryQueryIntoCatalog(
        catalogMap,
        request.query,
        normalizeRegistryUrlForCatalog()
      )

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
          icon: plugin.icon,
          entries: plugin.entries
        }))

      return {
        plugins,
        generatedAt: Date.now()
      }
    }
  }
}
