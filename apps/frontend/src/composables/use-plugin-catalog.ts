import type { InstalledPluginSummary } from '@synra/capacitor-electron/protocol'
import type { SynraPluginInstallSource } from '@synra/plugin-system'
import { tryGetSynraPluginRuntimeBridge } from '../plugins/bridge/synra-plugin-host-bridge'
import { unknownToErrorMessage } from '@synra/protocol'
import { SYNRA_PLUGIN_INSTALL_STORE_CHANGED_EVENT } from '../lib/plugin-install-store-events'
import { resolveCurrentPluginRegistryUrl } from '../lib/plugin-registry-preferences'
import { installPluginOnClient, removeInstalledPluginRecord } from '../plugins/install-manager'
import {
  isPluginRegistered,
  listPlugins,
  openPluginPage,
  syncInstalledPlugins,
  unregisterInstalledPlugin
} from '../plugins/host'

const DEFAULT_PLUGIN_ICON = 'material-symbols:extension-outline'
const DEFAULT_PLUGIN_PAGE = 'home'

function createDiagRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `plugin-catalog-${Date.now()}`
}

type PluginFailureKind =
  | 'artifactBroken'
  | 'registrationFailed'
  | 'activationFailed'
  | 'cleanupFailed'

type PluginFailure = {
  kind: PluginFailureKind
  message: string
}

export type PluginLifecycleStatus =
  | 'available'
  | 'installing'
  | 'registering'
  | 'ready'
  | 'broken'
  | 'removing'

export type PluginCardItem = {
  pluginId: string
  packageName?: string
  name: string
  version: string
  status: PluginLifecycleStatus
  defaultPage: string
  icon?: string
  logoUrl?: string
  builtin: boolean
  failure?: PluginFailure
  installSource?: SynraPluginInstallSource
  localSourcePath?: string
}

function enrichCardFromInstalled(
  plugin: PluginCardItem,
  installedById: Map<string, InstalledPluginSummary>
): PluginCardItem {
  const row = installedById.get(plugin.pluginId)
  if (!row) {
    return plugin
  }
  return {
    ...plugin,
    installSource: row.installSource,
    localSourcePath: row.localSourcePath
  }
}

function getFallbackPlugins(): PluginCardItem[] {
  return listPlugins().map((plugin) => ({
    pluginId: plugin.pluginId,
    packageName: plugin.packageName,
    name: plugin.title,
    version: plugin.version,
    status: 'ready',
    defaultPage: plugin.defaultPage,
    icon: plugin.icon,
    builtin: plugin.builtin
  }))
}

function toPluginFailure(kind: PluginFailureKind, message: string): PluginFailure {
  return { kind, message }
}

export function usePluginCatalog() {
  const router = useRouter()
  const loading = ref(false)
  const error = ref<string | null>(null)
  const keyword = ref('')
  const plugins = ref<PluginCardItem[]>(getFallbackPlugins())
  const reloadingPluginIds = ref<string[]>([])

  const filteredPlugins = computed(() => {
    const key = keyword.value.trim().toLowerCase()
    if (!key) {
      return plugins.value
    }

    return plugins.value.filter((plugin) => {
      return (
        plugin.name.toLowerCase().includes(key) ||
        plugin.pluginId.toLowerCase().includes(key) ||
        plugin.packageName?.toLowerCase().includes(key) ||
        plugin.version.toLowerCase().includes(key) ||
        plugin.installSource?.toLowerCase().includes(key)
      )
    })
  })

  async function refreshCatalog(): Promise<void> {
    const requestId = createDiagRequestId()
    loading.value = true
    error.value = null

    try {
      const bridge = tryGetSynraPluginRuntimeBridge()
      if (!bridge) {
        plugins.value = getFallbackPlugins()
        return
      }
      const query = keyword.value.trim()
      const registryUrl = await resolveCurrentPluginRegistryUrl()
      const installed = await bridge.listInstalledPlugins()
      const installedById = new Map(installed.plugins.map((p) => [p.pluginId, p]))
      const syncResult = await syncInstalledPlugins(installed.plugins, requestId)
      const installedIds = new Set(installed.plugins.map((plugin) => plugin.pluginId))
      const syncFailures = new Map(
        syncResult.failedPlugins.map((failed) => [failed.pluginId, failed])
      )
      const cleanupFailures = new Map<string, PluginFailure>()
      const cleanedPluginIds: string[] = []
      for (const failed of syncResult.failedPlugins) {
        if (!failed.cleanupRecommended || !installedIds.has(failed.pluginId)) {
          continue
        }
        try {
          await bridge.uninstallPlugin({ pluginId: failed.pluginId })
          removeInstalledPluginRecord(failed.pluginId)
          installedIds.delete(failed.pluginId)
          cleanedPluginIds.push(failed.pluginId)
        } catch (cleanupError) {
          cleanupFailures.set(
            failed.pluginId,
            toPluginFailure(
              'cleanupFailed',
              unknownToErrorMessage(
                cleanupError,
                `Failed to cleanup broken plugin '${failed.pluginId}'.`
              )
            )
          )
        }
      }
      if (cleanupFailures.size > 0) {
        error.value = [...cleanupFailures.values()].map((failure) => failure.message).join(' ')
      } else if (cleanedPluginIds.length > 0) {
        error.value = `Cleaned broken plugins: ${cleanedPluginIds.join(', ')}.`
      }
      const result = await bridge.getPluginCatalog({
        query: query.length > 0 ? query : undefined,
        registryUrl
      })
      const registeredIds = new Set(listPlugins().map((plugin) => plugin.pluginId))
      const fetched = result.plugins.map((plugin) => {
        const extension = plugin as {
          status?: 'installed' | 'available'
          defaultPage?: string
          icon?: string
          logoPath?: string
          builtin?: boolean
        }

        return {
          pluginId: plugin.pluginId,
          packageName: plugin.packageName,
          name: plugin.displayName,
          version: plugin.version,
          status: extension.status === 'installed' ? 'registering' : 'available',
          defaultPage: extension.defaultPage ?? DEFAULT_PLUGIN_PAGE,
          icon: extension.icon ?? DEFAULT_PLUGIN_ICON,
          logoUrl: extension.logoPath,
          builtin: extension.builtin ?? false
        }
      })

      const merged = new Map<string, PluginCardItem>()
      for (const plugin of getFallbackPlugins()) {
        merged.set(plugin.pluginId, enrichCardFromInstalled(plugin, installedById))
      }
      for (const plugin of fetched) {
        const previous = merged.get(plugin.pluginId)
        merged.set(plugin.pluginId, {
          ...plugin,
          builtin: previous?.builtin ?? plugin.builtin,
          defaultPage: previous?.defaultPage ?? plugin.defaultPage,
          icon: previous?.icon ?? plugin.icon,
          logoUrl: previous?.logoUrl ?? plugin.logoUrl,
          status: (registeredIds.has(plugin.pluginId)
            ? 'ready'
            : installedIds.has(plugin.pluginId)
              ? cleanupFailures.has(plugin.pluginId) || syncFailures.has(plugin.pluginId)
                ? 'broken'
                : 'registering'
              : plugin.status) as PluginLifecycleStatus,
          failure:
            cleanupFailures.get(plugin.pluginId) ??
            (syncFailures.has(plugin.pluginId)
              ? toPluginFailure(
                  syncFailures.get(plugin.pluginId)?.reason ?? 'registrationFailed',
                  syncFailures.get(plugin.pluginId)?.message ??
                    `Plugin '${plugin.pluginId}' failed to register.`
                )
              : undefined)
        })
      }

      plugins.value = [...merged.values()].map((p) => enrichCardFromInstalled(p, installedById))
    } catch (unknownError) {
      error.value = unknownToErrorMessage(unknownError, 'Failed to fetch plugin catalog.')
      plugins.value = getFallbackPlugins()
    } finally {
      loading.value = false
    }
  }

  async function openPlugin(plugin: PluginCardItem): Promise<void> {
    error.value = null
    try {
      if (
        plugin.status === 'registering' ||
        plugin.status === 'installing' ||
        plugin.status === 'removing'
      ) {
        return
      }

      if (plugin.status !== 'ready') {
        plugin.status = 'installing'
        plugin.failure = undefined
        if (!plugin.packageName) {
          throw new Error(`Plugin '${plugin.pluginId}' packageName is missing.`)
        }
        await installPluginOnClient({
          router,
          pluginId: plugin.pluginId,
          packageName: plugin.packageName,
          version: plugin.version,
          registryUrl: await resolveCurrentPluginRegistryUrl()
        })
        plugin.status = 'ready'
      }

      if (!isPluginRegistered(plugin.pluginId)) {
        plugin.status = 'broken'
        plugin.failure = toPluginFailure(
          'registrationFailed',
          `Plugin '${plugin.pluginId}' is not registered after installation.`
        )
        error.value = plugin.failure.message
        return
      }

      await openPluginPage(router, plugin.pluginId, `/${plugin.defaultPage}`)
    } catch (unknownError) {
      const message = unknownToErrorMessage(
        unknownError,
        `Failed to open plugin '${plugin.pluginId}'.`
      )
      const kind: PluginFailureKind =
        plugin.status === 'installing' ? 'registrationFailed' : 'activationFailed'
      plugin.status = 'broken'
      plugin.failure = toPluginFailure(kind, message)
      error.value = message
    }
  }

  async function uninstallPlugin(plugin: PluginCardItem): Promise<void> {
    error.value = null
    const bridge = tryGetSynraPluginRuntimeBridge()
    if (!bridge || plugin.builtin) {
      return
    }
    if (
      plugin.status !== 'ready' &&
      plugin.status !== 'broken' &&
      plugin.status !== 'registering'
    ) {
      return
    }
    plugin.status = 'removing'
    plugin.failure = undefined
    try {
      const result = await bridge.uninstallPlugin({ pluginId: plugin.pluginId })
      if (!result.success) {
        plugin.status = 'broken'
        plugin.failure = toPluginFailure(
          'cleanupFailed',
          `Could not remove plugin '${plugin.pluginId}'.`
        )
        error.value = plugin.failure.message
        return
      }
      removeInstalledPluginRecord(plugin.pluginId)
      await unregisterInstalledPlugin(router, plugin.pluginId)
      await refreshCatalog()
    } catch (unknownError) {
      plugin.status = 'broken'
      const message = unknownToErrorMessage(
        unknownError,
        `Failed to remove plugin '${plugin.pluginId}'.`
      )
      plugin.failure = toPluginFailure('cleanupFailed', message)
      error.value = message
    }
  }

  async function installPluginFromLocalPath(localPath: string): Promise<void> {
    error.value = null
    const path = localPath.trim()
    if (!path) {
      throw new Error('Local plugin path is required.')
    }
    const bridge = tryGetSynraPluginRuntimeBridge()
    if (!bridge) {
      throw new Error('Local plugin installation requires Electron or a supported host runtime.')
    }
    const requestId = createDiagRequestId()
    const installed = await bridge.installPluginFromLocalPath({ path })
    const syncResult = await syncInstalledPlugins([installed], requestId)
    const failed = syncResult.failedPlugins.find((item) => item.pluginId === installed.pluginId)
    if (failed) {
      throw new Error(`Failed to register local plugin '${installed.pluginId}': ${failed.message}`)
    }
    if (!syncResult.registeredPluginIds.includes(installed.pluginId)) {
      throw new Error(`Local plugin '${installed.pluginId}' is not registered after installation.`)
    }
    await refreshCatalog()
  }

  function isPluginReloading(pluginId: string): boolean {
    return reloadingPluginIds.value.includes(pluginId)
  }

  async function reloadLocalPlugin(plugin: PluginCardItem): Promise<void> {
    if (plugin.installSource !== 'local') {
      error.value = 'Reload from disk is only available for plugins installed from a local folder.'
      return
    }
    const path = plugin.localSourcePath?.trim()
    if (!path) {
      error.value = 'Missing local package path. Reinstall this plugin from a local folder.'
      return
    }
    const bridge = tryGetSynraPluginRuntimeBridge()
    if (!bridge) {
      error.value = 'Reload requires Electron or a supported host runtime.'
      return
    }
    if (plugin.builtin) {
      return
    }
    if (
      plugin.status !== 'ready' &&
      plugin.status !== 'broken' &&
      plugin.status !== 'registering'
    ) {
      return
    }
    if (isPluginReloading(plugin.pluginId)) {
      return
    }
    error.value = null
    reloadingPluginIds.value = [...reloadingPluginIds.value, plugin.pluginId]
    try {
      const requestId = createDiagRequestId()
      const installed = await bridge.installPluginFromLocalPath({ path })
      const syncResult = await syncInstalledPlugins([installed], requestId)
      const failed = syncResult.failedPlugins.find((item) => item.pluginId === installed.pluginId)
      if (failed) {
        throw new Error(`Failed to register plugin after reload: ${failed.message}`)
      }
      if (!syncResult.registeredPluginIds.includes(installed.pluginId)) {
        throw new Error(`Plugin '${installed.pluginId}' is not registered after reload.`)
      }
      await refreshCatalog()
    } catch (unknownError) {
      error.value = unknownToErrorMessage(unknownError, 'Failed to reload plugin from local path.')
      await refreshCatalog()
    } finally {
      reloadingPluginIds.value = reloadingPluginIds.value.filter((id) => id !== plugin.pluginId)
    }
  }

  function onInstallStoreChanged(): void {
    void refreshCatalog()
  }

  onMounted(() => {
    void refreshCatalog()
    if (typeof window !== 'undefined') {
      window.addEventListener(SYNRA_PLUGIN_INSTALL_STORE_CHANGED_EVENT, onInstallStoreChanged)
    }
  })

  onUnmounted(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener(SYNRA_PLUGIN_INSTALL_STORE_CHANGED_EVENT, onInstallStoreChanged)
    }
  })

  return {
    error,
    filteredPlugins,
    installPluginFromLocalPath,
    isPluginReloading,
    keyword,
    loading,
    openPlugin,
    refreshCatalog,
    reloadLocalPlugin,
    uninstallPlugin
  }
}
