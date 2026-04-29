import type { ImportxOptions } from 'importx'

let importxModulePromise: Promise<typeof import('importx')> | undefined

/**
 * Single lazy-loaded `importx` module instance per process (see ai-docs/plugin-system/08-plugin-import-loader.md).
 */
export function getSynraImportxModule(): Promise<typeof import('importx')> {
  importxModulePromise ??= import('importx')
  return importxModulePromise
}

export type SynraPluginModuleLayer = 'host' | 'ui' | 'worker'

/**
 * Loads a plugin sub-entry via importx (`host` / `ui` / `worker` is semantic only; `specifier` is the file path).
 * Defaults: `parentURL` = this module’s `import.meta.url`, `cache: null`, `listDependencies: false`, `loader: 'auto'`.
 */
export async function loadSynraPluginModule<T = unknown>(
  layer: SynraPluginModuleLayer,
  specifier: string,
  options?: ImportxOptions
): Promise<T> {
  void layer
  const importx = await getSynraImportxModule()
  const { parentURL, ...rest } = options ?? {}
  const merged: ImportxOptions = {
    cache: null,
    listDependencies: false,
    loader: 'auto',
    ...rest,
    parentURL: parentURL ?? import.meta.url
  }
  const mod = await importx.import(specifier, merged)
  return mod as T
}
