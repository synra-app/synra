import { SynraPreferences } from '@synra/capacitor-preferences'

export const PLUGIN_REGISTRY_PREFERENCES_KEY = 'synra.plugin.registry'
export const DEFAULT_PLUGIN_REGISTRY_SOURCE_ID = 'npm'

export type PluginRegistrySourceId = 'npm' | 'taobao' | 'tencent' | 'huawei'

export type PluginRegistryPreferences = {
  sourceId: PluginRegistrySourceId
  useCustomRegistry: boolean
  customRegistryUrl: string
}

export type PluginRegistrySourceOption = {
  id: PluginRegistrySourceId
  label: string
  url: string
}

export const PLUGIN_REGISTRY_SOURCE_OPTIONS: PluginRegistrySourceOption[] = [
  { id: 'npm', label: 'npm (Official)', url: 'https://registry.npmjs.org' },
  { id: 'taobao', label: 'npmmirror (Taobao)', url: 'https://registry.npmmirror.com' },
  { id: 'tencent', label: 'Tencent Mirror', url: 'https://mirrors.tencent.com/npm' },
  { id: 'huawei', label: 'Huawei Cloud', url: 'https://repo.huaweicloud.com/repository/npm' }
]

const SOURCE_MAP = new Map(PLUGIN_REGISTRY_SOURCE_OPTIONS.map((item) => [item.id, item]))

function isPluginRegistrySourceId(value: unknown): value is PluginRegistrySourceId {
  return typeof value === 'string' && SOURCE_MAP.has(value as PluginRegistrySourceId)
}

export function normalizeRegistryUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '')
  if (!trimmed) {
    throw new Error('Registry URL is required.')
  }
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new Error('Registry URL is invalid.')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Registry URL must use http or https.')
  }
  return trimmed
}

export function createDefaultPluginRegistryPreferences(): PluginRegistryPreferences {
  return {
    sourceId: DEFAULT_PLUGIN_REGISTRY_SOURCE_ID,
    useCustomRegistry: false,
    customRegistryUrl: ''
  }
}

function parsePreferences(raw: string | null): PluginRegistryPreferences {
  if (!raw) {
    return createDefaultPluginRegistryPreferences()
  }
  try {
    const parsed = JSON.parse(raw) as {
      sourceId?: unknown
      useCustomRegistry?: unknown
      customRegistryUrl?: unknown
    }
    const sourceId = isPluginRegistrySourceId(parsed.sourceId)
      ? parsed.sourceId
      : DEFAULT_PLUGIN_REGISTRY_SOURCE_ID
    const useCustomRegistry = parsed.useCustomRegistry === true
    const customRegistryUrl =
      typeof parsed.customRegistryUrl === 'string' ? parsed.customRegistryUrl.trim() : ''
    return {
      sourceId,
      useCustomRegistry,
      customRegistryUrl
    }
  } catch {
    return createDefaultPluginRegistryPreferences()
  }
}

export async function loadPluginRegistryPreferences(): Promise<PluginRegistryPreferences> {
  const raw = await SynraPreferences.get({ key: PLUGIN_REGISTRY_PREFERENCES_KEY })
  return parsePreferences(raw.value)
}

export async function savePluginRegistryPreferences(
  preferences: PluginRegistryPreferences
): Promise<void> {
  await SynraPreferences.set({
    key: PLUGIN_REGISTRY_PREFERENCES_KEY,
    value: JSON.stringify(preferences)
  })
}

export function resolveRegistryUrlFromPreferences(preferences: PluginRegistryPreferences): string {
  if (preferences.useCustomRegistry) {
    return normalizeRegistryUrl(preferences.customRegistryUrl)
  }
  return (
    SOURCE_MAP.get(preferences.sourceId)?.url ??
    SOURCE_MAP.get(DEFAULT_PLUGIN_REGISTRY_SOURCE_ID)!.url
  )
}

export async function resolveCurrentPluginRegistryUrl(): Promise<string> {
  const preferences = await loadPluginRegistryPreferences()
  return resolveRegistryUrlFromPreferences(preferences)
}
