import { createElectronBridgePluginFromGlobal } from '@synra/capacitor-electron/api/plugin'
import { unknownToErrorMessage } from '@synra/protocol'
import { resolveCurrentPluginRegistryUrl } from '../lib/plugin-registry-preferences'
import { getInstalledPluginRecord, installPluginOnClient } from '../plugins/install-manager'
import { listPlugins, openPluginPage, syncInstalledPlugins } from '../plugins/host'

const DEFAULT_PLUGIN_ICON = 'material-symbols:extension-outline'

export type PluginCardItem = {
  pluginId: string
  packageName?: string
  name: string
  version: string
  status: 'installed' | 'available'
  defaultPage: string
  icon?: string
  logoUrl?: string
  builtin: boolean
  installState?: 'idle' | 'installing' | 'failed'
}

function getFallbackPlugins(): PluginCardItem[] {
  return listPlugins().map((plugin) => ({
    pluginId: plugin.pluginId,
    packageName: plugin.packageName,
    name: plugin.title,
    version: plugin.version,
    status: 'installed',
    defaultPage: plugin.defaultPage,
    icon: plugin.icon,
    builtin: plugin.builtin
  }))
}

export function usePluginCatalog() {
  const router = useRouter()
  const loading = ref(false)
  const error = ref<string | null>(null)
  const keyword = ref('')
  const plugins = ref<PluginCardItem[]>(getFallbackPlugins())

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
        plugin.version.toLowerCase().includes(key)
      )
    })
  })

  async function refreshCatalog(): Promise<void> {
    loading.value = true
    error.value = null

    try {
      if (!window.__synraCapElectron?.invoke) {
        plugins.value = getFallbackPlugins()
        return
      }

      const bridge = createElectronBridgePluginFromGlobal()
      const query = keyword.value.trim()
      const registryUrl = await resolveCurrentPluginRegistryUrl()
      const [result, installed] = await Promise.all([
        bridge.getPluginCatalog({
          query: query.length > 0 ? query : undefined,
          registryUrl
        }),
        bridge.listInstalledPlugins()
      ])
      await syncInstalledPlugins(installed.plugins)
      const installedIds = new Set(installed.plugins.map((plugin) => plugin.pluginId))
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
          status: extension.status ?? ('installed' as const),
          defaultPage: extension.defaultPage ?? 'home',
          icon: extension.icon ?? DEFAULT_PLUGIN_ICON,
          logoUrl: extension.logoPath,
          builtin: extension.builtin ?? false
        }
      })

      const merged = new Map<string, PluginCardItem>()
      for (const plugin of getFallbackPlugins()) {
        merged.set(plugin.pluginId, plugin)
      }
      for (const plugin of fetched) {
        const previous = merged.get(plugin.pluginId)
        merged.set(plugin.pluginId, {
          ...plugin,
          builtin: previous?.builtin ?? plugin.builtin,
          defaultPage: previous?.defaultPage ?? plugin.defaultPage,
          icon: previous?.icon ?? plugin.icon,
          logoUrl: previous?.logoUrl ?? plugin.logoUrl,
          status:
            installedIds.has(plugin.pluginId) || getInstalledPluginRecord(plugin.pluginId)
              ? 'installed'
              : plugin.status
        })
      }

      plugins.value = [...merged.values()]
    } catch (unknownError) {
      error.value = unknownToErrorMessage(unknownError, 'Failed to fetch plugin catalog.')
      plugins.value = getFallbackPlugins()
    } finally {
      loading.value = false
    }
  }

  async function openPlugin(plugin: PluginCardItem): Promise<void> {
    if (plugin.status !== 'installed') {
      plugin.installState = 'installing'
      try {
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
        plugin.status = 'installed'
        plugin.installState = 'idle'
      } catch (unknownError) {
        plugin.installState = 'failed'
        throw unknownError
      }
    }

    plugin.installState = 'idle'
    await openPluginPage(router, plugin.pluginId, `/${plugin.defaultPage}`)
  }

  onMounted(() => {
    void refreshCatalog()
  })

  return {
    error,
    filteredPlugins,
    keyword,
    loading,
    openPlugin,
    refreshCatalog
  }
}
