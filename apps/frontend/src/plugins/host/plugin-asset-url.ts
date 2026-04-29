const PLUGIN_ASSET_SCHEME = 'synra-plugin'

export function toPluginAssetUrl(pluginId: string, relativePath: string): string {
  const normalizedPath = relativePath.replace(/\\/g, '/').replace(/^\/+/, '')
  return `${PLUGIN_ASSET_SCHEME}://${encodeURIComponent(pluginId)}/${encodeURI(normalizedPath)}`
}
