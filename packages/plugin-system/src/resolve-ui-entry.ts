import { join, normalize } from 'pathe'

import type { SynraPluginManifestEntries } from './manifest'

/** Default UI bundle path relative to the extracted package root (`<artifactRoot>/package/`). */
export const DEFAULT_SYNRA_UI_ENTRY = 'dist/ui/index.mjs'

/**
 * Resolves the UI entry path segment (relative to `<artifactRoot>/package/`).
 */
export function resolveSynraPluginUiEntryRelativePath(
  entries: SynraPluginManifestEntries | undefined
): string {
  const ui = entries?.ui?.trim()
  if (ui && ui.length > 0) {
    return ui
  }
  return DEFAULT_SYNRA_UI_ENTRY
}

/**
 * Absolute filesystem path to the UI ESM entry under the install layout
 * `<artifactRoot>/package/<relativePath>`.
 * Uses [pathe](https://github.com/unjs/pathe) for cross-platform normalization (POSIX-style `/` output).
 */
export function resolveSynraPluginUiEntryAbsolutePath(
  artifactRoot: string,
  entries: SynraPluginManifestEntries | undefined
): string {
  const relative = resolveSynraPluginUiEntryRelativePath(entries)
  const segment = relative.replace(/^[/\\]+/, '')
  return normalize(join(artifactRoot, 'package', segment))
}
