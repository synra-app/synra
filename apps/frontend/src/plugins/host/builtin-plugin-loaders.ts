import type { SynraPlugin, SynraPluginManifest } from '@synra/plugin-sdk'

const posix = (path: string): string => path.replace(/\\/g, '/')

function matchPackageFromNodeModulesPath(path: string): string | undefined {
  const p = posix(path)
  const m = p.match(/\/node_modules\/(@synra-plugin\/[^/]+)\//)
  return m?.[1]
}

/** Eager: discover which workspace / installed UI plugins exist under @synra-plugin/*. */
const builtinPackageJsonModules = import.meta.glob('/node_modules/@synra-plugin/*/package.json', {
  eager: true,
  import: 'default'
}) as Record<string, SynraPluginManifest>

const builtinPluginEntryLoaders = import.meta.glob([
  '/node_modules/@synra-plugin/*/src/index.ts',
  '/node_modules/@synra-plugin/*/dist/index.mjs'
])

const builtinPluginStyleLoaders = import.meta.glob('/node_modules/@synra-plugin/*/dist/style.css')

export function discoverBuiltinSynraUiPluginPackages(): Array<{
  packageName: string
  manifest: SynraPluginManifest
}> {
  const out: Array<{ packageName: string; manifest: SynraPluginManifest }> = []
  for (const [path, manifest] of Object.entries(builtinPackageJsonModules)) {
    const packageName = matchPackageFromNodeModulesPath(path)
    if (!packageName || !manifest?.synra || typeof manifest.name !== 'string') {
      continue
    }
    out.push({ packageName, manifest })
  }
  return out
}

function findEntryLoaderKey(packageName: string): string | undefined {
  const suffixes = [
    `/node_modules/${packageName}/src/index.ts`,
    `/node_modules/${packageName}/dist/index.mjs`
  ]
  for (const key of Object.keys(builtinPluginEntryLoaders)) {
    const p = posix(key)
    if (suffixes.some((s) => p.endsWith(s))) {
      return key
    }
  }
  return undefined
}

export type SynraPluginConstructor = new () => SynraPlugin

export async function loadBuiltinSynraPluginEntry(
  packageName: string
): Promise<SynraPluginConstructor> {
  const key = findEntryLoaderKey(packageName)
  if (!key) {
    throw new Error(
      `No plugin entry found for '${packageName}' (expected src/index.ts or dist/index.mjs).`
    )
  }
  const mod = (await builtinPluginEntryLoaders[key]()) as { default?: unknown }
  const ctor = mod.default
  if (typeof ctor !== 'function') {
    throw new Error(`Plugin '${packageName}' entry must export default class.`)
  }
  return ctor as SynraPluginConstructor
}

const loadedStylePackages = new Set<string>()

/**
 * Loads packaged Uno/CSS bundle for a plugin once (dist/style.css from vp pack).
 * No-op if the file is missing (e.g. plugin not built yet).
 */
export async function loadBuiltinSynraPluginStylesOnce(packageName: string): Promise<void> {
  if (loadedStylePackages.has(packageName)) {
    return
  }
  const suffix = `/node_modules/${packageName}/dist/style.css`
  const key = Object.keys(builtinPluginStyleLoaders).find((k) => posix(k).endsWith(suffix))
  if (!key) {
    loadedStylePackages.add(packageName)
    return
  }
  await builtinPluginStyleLoaders[key]()
  loadedStylePackages.add(packageName)
}
