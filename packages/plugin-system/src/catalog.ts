import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { SynraPluginManifest, SynraPluginManifestMetadata } from './manifest'
import { getSynraPluginManifestMetadata } from './manifest'

export type InstalledPluginManifestRecord = {
  manifest: SynraPluginManifest
  metadata: SynraPluginManifestMetadata
  packageRoot: string
}

function safeReadManifest(manifestPath: string): SynraPluginManifest | null {
  try {
    const raw = readFileSync(manifestPath, 'utf8')
    const parsed = JSON.parse(raw) as SynraPluginManifest
    return parsed
  } catch {
    return null
  }
}

function listScopedPackageDirs(nodeModulesDir: string): string[] {
  const scopedRoot = resolve(nodeModulesDir, '@synra-plugin')
  if (!existsSync(scopedRoot)) {
    return []
  }
  return readdirSync(scopedRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => resolve(scopedRoot, entry.name))
}

function listUnscopedPackageDirs(nodeModulesDir: string): string[] {
  if (!existsSync(nodeModulesDir)) {
    return []
  }
  return readdirSync(nodeModulesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('synra-plugin-'))
    .map((entry) => resolve(nodeModulesDir, entry.name))
}

export function discoverInstalledPluginManifestRecords(
  nodeModulesDir: string
): InstalledPluginManifestRecord[] {
  const packageDirs = [
    ...listScopedPackageDirs(nodeModulesDir),
    ...listUnscopedPackageDirs(nodeModulesDir)
  ]
  const records: InstalledPluginManifestRecord[] = []

  for (const packageDir of packageDirs) {
    const manifestPath = resolve(packageDir, 'package.json')
    const manifest = safeReadManifest(manifestPath)
    if (!manifest?.synra) {
      continue
    }

    try {
      records.push({
        manifest,
        metadata: getSynraPluginManifestMetadata(manifest),
        packageRoot: packageDir
      })
    } catch {
      continue
    }
  }

  return records
}
