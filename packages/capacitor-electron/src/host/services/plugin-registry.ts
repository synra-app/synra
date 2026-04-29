const DEFAULT_REGISTRY_URL = 'https://registry.npmjs.org'

export function normalizePluginRegistryUrl(input: string): string {
  const normalized = input.trim().replace(/\/+$/, '')
  if (!normalized) {
    throw new Error('Registry URL is required.')
  }
  if (!/^https?:\/\//.test(normalized)) {
    throw new Error(`Invalid registry url '${normalized}'.`)
  }
  return normalized
}

export function resolvePluginRegistryUrl(input?: string): string {
  const fromInput = input?.trim()
  if (fromInput) {
    return normalizePluginRegistryUrl(fromInput)
  }
  const fromEnv = process.env.SYNRA_PLUGIN_REGISTRY_URL?.trim()
  if (fromEnv) {
    return normalizePluginRegistryUrl(fromEnv)
  }
  return DEFAULT_REGISTRY_URL
}
