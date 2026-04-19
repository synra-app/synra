export function normalizePluginPagePath(pagePath: string): string {
  const normalized = pagePath.startsWith('/') ? pagePath : `/${pagePath}`
  return normalized.replace(/\/+/g, '/')
}

export function pluginFilePathToPagePath(filePath: string): string {
  const normalized = filePath.replaceAll('\\', '/').replace(/^\/+/, '')
  const withoutDistPrefix = normalized.replace(/^dist\//, '')
  const withoutPagesPrefix = withoutDistPrefix.replace(/^pages\//, '')
  const withoutFileSuffix = withoutPagesPrefix.replace(/\/index\.(vue|mjs)$/i, '')
  const runtimePath = `/${withoutFileSuffix || 'home'}`.replace(/\/+/g, '/')
  return normalizePluginPagePath(runtimePath)
}
