import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'pathe'
import type { SynraPluginInstallSource } from './install-metadata'

export type { SynraPluginInstallSource } from './install-metadata'

export type SynraInstalledPluginRecord = {
  pluginId: string
  packageName: string
  version: string
  title: string
  defaultPage: string
  builtin: boolean
  icon?: string
  installedAt: number
  artifactRoot: string
  entries: Partial<Record<'ui' | 'worker' | 'shared' | 'host', string>>
  hash?: string
  installSource: SynraPluginInstallSource
  /** Absolute package root; only when installSource is `local`. */
  localSourcePath?: string
}

export type SynraPluginInstallStore = {
  list(): SynraInstalledPluginRecord[]
  get(pluginId: string): SynraInstalledPluginRecord | undefined
  upsert(record: SynraInstalledPluginRecord): SynraInstalledPluginRecord
  remove(pluginId: string): boolean
}

type InstallStoreDocument = {
  installed: SynraInstalledPluginRecord[]
}

const INSTALL_SOURCES = new Set<SynraPluginInstallSource>(['registry', 'local', 'git'])

function parseInstallSource(raw: unknown): SynraPluginInstallSource | undefined {
  return typeof raw === 'string' && INSTALL_SOURCES.has(raw as SynraPluginInstallSource)
    ? (raw as SynraPluginInstallSource)
    : undefined
}

function sanitizeInstalledRows(rows: SynraInstalledPluginRecord[]): SynraInstalledPluginRecord[] {
  const next: SynraInstalledPluginRecord[] = []
  for (const row of rows) {
    const installSource = parseInstallSource(row.installSource)
    if (!installSource) {
      continue
    }
    let localSourcePath = row.localSourcePath
    if (installSource !== 'local') {
      localSourcePath = undefined
    }
    next.push({ ...row, installSource, localSourcePath })
  }
  return next
}

function readStoreDocument(filePath: string): InstallStoreDocument {
  if (!existsSync(filePath)) {
    return { installed: [] }
  }
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as InstallStoreDocument
    if (!Array.isArray(parsed.installed)) {
      return { installed: [] }
    }
    return { installed: sanitizeInstalledRows(parsed.installed) }
  } catch {
    return { installed: [] }
  }
}

function writeStoreDocument(filePath: string, doc: InstallStoreDocument): void {
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, JSON.stringify(doc, null, 2), 'utf8')
}

export function createSynraPluginInstallStore(filePath: string): SynraPluginInstallStore {
  return {
    list(): SynraInstalledPluginRecord[] {
      return readStoreDocument(filePath).installed
    },
    get(pluginId: string): SynraInstalledPluginRecord | undefined {
      return readStoreDocument(filePath).installed.find((record) => record.pluginId === pluginId)
    },
    upsert(record: SynraInstalledPluginRecord): SynraInstalledPluginRecord {
      const doc = readStoreDocument(filePath)
      const next = doc.installed.filter((item) => item.pluginId !== record.pluginId)
      next.push(record)
      writeStoreDocument(filePath, {
        installed: next.sort((left, right) => left.pluginId.localeCompare(right.pluginId))
      })
      return record
    },
    remove(pluginId: string): boolean {
      const doc = readStoreDocument(filePath)
      const next = doc.installed.filter((record) => record.pluginId !== pluginId)
      if (next.length === doc.installed.length) {
        return false
      }
      writeStoreDocument(filePath, { installed: next })
      return true
    }
  }
}
