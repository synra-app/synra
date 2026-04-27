import type { SynraPluginPackageName } from './naming'
import { parsePluginIdFromPackageName } from './naming'

export const SYNRA_PLUGIN_ENTRY_KINDS = ['ui', 'worker', 'shared', 'host'] as const
export type SynraPluginEntryKind = (typeof SYNRA_PLUGIN_ENTRY_KINDS)[number]

export type SynraPluginManifestEntries = Partial<Record<SynraPluginEntryKind, string>>

export type SynraPluginManifest = {
  name: string
  version: string
  synra?: {
    title?: string
    description?: string
    defaultPage?: string
    builtin?: boolean
    icon?: string
    entries?: SynraPluginManifestEntries
  }
}

export type SynraPluginManifestMetadata = {
  pluginId: string
  packageName: SynraPluginPackageName
  version: string
  title: string
  builtin: boolean
  defaultPage: string
  icon?: string
  entries: SynraPluginManifestEntries
}

const ICONIFY_ICON_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:-[a-z0-9]+)*$/i

function normalizeManifestIcon(icon: string | undefined): string | undefined {
  if (!icon) {
    return undefined
  }
  const normalized = icon.trim()
  if (!normalized || !ICONIFY_ICON_NAME_PATTERN.test(normalized)) {
    return undefined
  }
  return normalized
}

function normalizeEntries(entries?: SynraPluginManifestEntries): SynraPluginManifestEntries {
  if (!entries) {
    return {}
  }
  const normalized: SynraPluginManifestEntries = {}
  for (const kind of SYNRA_PLUGIN_ENTRY_KINDS) {
    const value = entries[kind]
    if (typeof value === 'string' && value.trim().length > 0) {
      normalized[kind] = value.trim()
    }
  }
  return normalized
}

export function getSynraPluginManifestMetadata(
  manifest: SynraPluginManifest
): SynraPluginManifestMetadata {
  const pluginId = parsePluginIdFromPackageName(manifest.name)
  if (!pluginId) {
    throw new Error(
      `Cannot derive pluginId from package name '${manifest.name}'. Expected @synra-plugin/<id> or synra-plugin-<id>.`
    )
  }

  return {
    pluginId,
    packageName: manifest.name as SynraPluginPackageName,
    version: manifest.version,
    title: manifest.synra?.title ?? pluginId,
    builtin: manifest.synra?.builtin ?? false,
    defaultPage: manifest.synra?.defaultPage ?? 'home',
    icon: normalizeManifestIcon(manifest.synra?.icon),
    entries: normalizeEntries(manifest.synra?.entries)
  }
}
