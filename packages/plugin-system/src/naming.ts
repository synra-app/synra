const SCOPED_PLUGIN_PREFIX = '@synra-plugin/'
const UNSCOPED_PLUGIN_PREFIX = 'synra-plugin-'
const PLUGIN_ID_PATTERN = /^[a-z0-9-]+$/

export type SynraPluginPackageName = `@synra-plugin/${string}` | `synra-plugin-${string}`

export function isValidSynraPluginPackageName(
  packageName: string
): packageName is SynraPluginPackageName {
  const pluginId = parsePluginIdFromPackageName(packageName)
  return typeof pluginId === 'string' && pluginId.length > 0
}

export function parsePluginIdFromPackageName(packageName: string): string | null {
  let candidate = ''
  if (packageName.startsWith(SCOPED_PLUGIN_PREFIX)) {
    candidate = packageName.slice(SCOPED_PLUGIN_PREFIX.length)
  } else if (packageName.startsWith(UNSCOPED_PLUGIN_PREFIX)) {
    candidate = packageName.slice(UNSCOPED_PLUGIN_PREFIX.length)
  } else {
    return null
  }
  return PLUGIN_ID_PATTERN.test(candidate) ? candidate : null
}
