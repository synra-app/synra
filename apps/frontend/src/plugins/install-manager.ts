import { createElectronBridgePluginFromGlobal } from '@synra/capacitor-electron/api/plugin'
import type { Router } from 'vue-router'
import { activatePlugin, syncInstalledPlugins } from './host'

const CACHE_KEY = 'synra.plugin.install.cache.v1'

export type PluginInstallStage =
  | 'sync-catalog'
  | 'download-assets'
  | 'validate-assets'
  | 'cache-assets'
  | 'activate-plugin'

export type PluginInstallRecord = {
  pluginId: string
  packageName: string
  version: string
  checksum: string
  installedAt: number
  assetKey: string
}

type PluginInstallMap = Record<string, PluginInstallRecord>

function readInstallCache(): PluginInstallMap {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) {
      return {}
    }
    const parsed = JSON.parse(raw) as PluginInstallMap
    return parsed ?? {}
  } catch {
    return {}
  }
}

function writeInstallCache(cache: PluginInstallMap): void {
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
}

async function sha256(input: string): Promise<string> {
  if (!crypto.subtle) {
    return btoa(input)
  }

  const bytes = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('')
}

export async function installPluginOnClient(options: {
  router: Router
  pluginId: string
  packageName: string
  version: string
  registryUrl?: string
  assetKey?: string
  onStageChange?: (stage: PluginInstallStage) => void
}): Promise<PluginInstallRecord> {
  options.onStageChange?.('sync-catalog')
  if (!window.__synraCapElectron?.invoke) {
    throw new Error('Electron bridge is unavailable. Dynamic plugin installation is not supported.')
  }
  const bridge = createElectronBridgePluginFromGlobal()
  options.onStageChange?.('download-assets')
  const installed = await bridge.installPlugin({
    packageName: options.packageName,
    version: options.version,
    registryUrl: options.registryUrl
  })
  options.onStageChange?.('cache-assets')
  const cache = readInstallCache()
  const record: PluginInstallRecord = {
    pluginId: installed.pluginId,
    packageName: installed.packageName,
    version: installed.version,
    checksum: await sha256(`${installed.pluginId}:${installed.version}:${installed.artifactRoot}`),
    installedAt: installed.installedAt,
    assetKey: installed.artifactRoot
  }
  cache[record.pluginId] = record
  writeInstallCache(cache)
  await syncInstalledPlugins([installed])

  options.onStageChange?.('activate-plugin')
  await activatePlugin(options.router, options.pluginId)
  return record
}

export function getInstalledPluginRecord(pluginId: string): PluginInstallRecord | null {
  return readInstallCache()[pluginId] ?? null
}
