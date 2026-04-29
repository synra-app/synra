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
export type SynraPluginDiagContext = {
  pluginId?: string | null
  requestId?: string | null
}

/**
 * Loads a plugin sub-entry via importx (`host` / `ui` / `worker` is semantic only; `specifier` is the file path).
 * Uses npm-plugin-kit style call signature: `importx.importx(specifier, parentURL)`.
 */
export async function loadSynraPluginModule<T = unknown>(
  layer: SynraPluginModuleLayer,
  specifier: string,
  options?: ImportxOptions,
  context?: SynraPluginDiagContext
): Promise<T> {
  void layer
  void context
  const importx = await getSynraImportxModule()
  const parentURL = options?.parentURL ?? import.meta.url
  const mod = await (
    importx as { importx: (id: string, parentURL?: string | URL) => Promise<unknown> }
  ).importx(specifier, parentURL)
  return mod as T
}
