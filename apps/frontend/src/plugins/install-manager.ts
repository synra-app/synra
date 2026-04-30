import { getSynraPluginRuntimeBridgeOrThrow } from './bridge/synra-plugin-host-bridge'
import type { Router } from 'vue-router'
import { activatePlugin, syncInstalledPlugins } from './host'

const CACHE_KEY = 'synra.plugin.install.cache.v1'

export type PluginInstallStage =
  | 'sync-catalog'
  | 'download-assets'
  | 'validate-assets'
  | 'cache-assets'
  | 'register-plugin'
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

function createDiagRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `plugin-install-${Date.now()}`
}

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
  const requestId = createDiagRequestId()
  options.onStageChange?.('sync-catalog')
  const bridge = getSynraPluginRuntimeBridgeOrThrow()
  options.onStageChange?.('download-assets')
  const installed = await bridge.installPlugin({
    packageName: options.packageName,
    version: options.version,
    registryUrl: options.registryUrl
  })
  const rollbackInstall = async (): Promise<void> => {
    await bridge.uninstallPlugin({ pluginId: installed.pluginId }).catch(() => undefined)
    removeInstalledPluginRecord(installed.pluginId)
  }

  try {
    options.onStageChange?.('cache-assets')
    const cache = readInstallCache()
    const record: PluginInstallRecord = {
      pluginId: installed.pluginId,
      packageName: installed.packageName,
      version: installed.version,
      checksum: await sha256(
        `${installed.pluginId}:${installed.version}:${installed.artifactRoot}`
      ),
      installedAt: installed.installedAt,
      assetKey: installed.artifactRoot
    }
    cache[record.pluginId] = record
    writeInstallCache(cache)
    options.onStageChange?.('register-plugin')
    const syncReport = await syncInstalledPlugins([installed], requestId)
    const failedForCurrent = syncReport.failedPlugins.find(
      (item) => item.pluginId === installed.pluginId
    )
    if (options.pluginId !== installed.pluginId) {
      throw new Error(
        `Installed plugin id '${installed.pluginId}' does not match requested id '${options.pluginId}'.`
      )
    }
    const failed = failedForCurrent
    if (failed) {
      throw new Error(`Failed to register plugin '${installed.pluginId}': ${failed.message}`)
    }
    if (!syncReport.registeredPluginIds.includes(installed.pluginId)) {
      throw new Error(`Plugin '${installed.pluginId}' is not registered after installation.`)
    }

    options.onStageChange?.('activate-plugin')
    await activatePlugin(options.router, installed.pluginId)
    return record
  } catch (error) {
    await rollbackInstall()
    throw error
  }
}

export function getInstalledPluginRecord(pluginId: string): PluginInstallRecord | null {
  return readInstallCache()[pluginId] ?? null
}

export function removeInstalledPluginRecord(pluginId: string): void {
  const cache = readInstallCache()
  if (!cache[pluginId]) {
    return
  }
  delete cache[pluginId]
  writeInstallCache(cache)
}
