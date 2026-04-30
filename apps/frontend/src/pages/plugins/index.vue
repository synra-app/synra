<script setup lang="ts">
import AppButton from '../../components/base/AppButton.vue'
import type { PluginCardItem } from '../../composables/use-plugin-catalog'
import { tryGetSynraPluginRuntimeBridge } from '../../plugins/bridge/synra-plugin-host-bridge'
import { useLanDiscoveryStore } from '../../stores/lan-discovery'

const pluginBridgeAvailable = computed(() => tryGetSynraPluginRuntimeBridge() !== null)

const {
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
} = usePluginCatalog()

const { syncableDisplayDevices, syncPluginToDevices } = usePluginSync()
const lanStore = useLanDiscoveryStore()

const syncDialogOpen = ref(false)
const syncDialogPlugin = ref<PluginCardItem | null>(null)
const syncSelectedIds = ref<string[]>([])
const syncBusy = ref(false)
const syncFeedback = ref<string | null>(null)
const syncProgress = ref<{ done: number; total: number } | null>(null)

function openSyncDialog(plugin: PluginCardItem): void {
  void lanStore.ensureReady().catch(() => undefined)
  syncDialogPlugin.value = plugin
  syncSelectedIds.value = syncableDisplayDevices.value.map((d) => d.deviceId)
  syncFeedback.value = null
  syncProgress.value = null
  syncDialogOpen.value = true
}

function closeSyncDialog(): void {
  syncDialogOpen.value = false
  syncDialogPlugin.value = null
}

async function onPluginRemoveRequest(plugin: PluginCardItem): Promise<void> {
  await uninstallPlugin(plugin)
}

async function onReloadLocalRequest(plugin: PluginCardItem): Promise<void> {
  await reloadLocalPlugin(plugin)
}

function toggleSyncDevice(deviceId: string): void {
  if (syncSelectedIds.value.includes(deviceId)) {
    syncSelectedIds.value = syncSelectedIds.value.filter((id) => id !== deviceId)
  } else {
    syncSelectedIds.value = [...syncSelectedIds.value, deviceId]
  }
}

async function submitPluginSync(): Promise<void> {
  const plugin = syncDialogPlugin.value
  if (!plugin || syncSelectedIds.value.length === 0) {
    return
  }
  syncBusy.value = true
  syncFeedback.value = null
  syncProgress.value = { done: 0, total: syncSelectedIds.value.length }
  try {
    const result = await syncPluginToDevices({
      pluginId: plugin.pluginId,
      deviceIds: syncSelectedIds.value,
      onProgress: (done, total) => {
        syncProgress.value = { done, total }
      }
    })
    if (result.errors.length > 0) {
      syncFeedback.value = result.errors.join(' ')
    } else {
      const parts: string[] = []
      if (result.syncedCount > 0) {
        parts.push(`Synced to ${result.syncedCount} device(s).`)
      }
      if (result.skippedSameVersionCount > 0) {
        parts.push(
          `${result.skippedSameVersionCount} device(s) already had this version — skipped transfer.`
        )
      }
      syncFeedback.value =
        parts.length > 0 ? parts.join(' ') : 'Nothing to do for selected devices.'
    }
  } catch (err) {
    syncFeedback.value = err instanceof Error ? err.message : String(err)
  } finally {
    syncBusy.value = false
  }
}

const localInstallDialogOpen = ref(false)
const localPluginPath = ref('')
const localInstallLoading = ref(false)
const localInstallError = ref<string | null>(null)

async function submitLocalInstall(): Promise<void> {
  localInstallError.value = null
  localInstallLoading.value = true
  try {
    await installPluginFromLocalPath(localPluginPath.value)
    localInstallDialogOpen.value = false
    localPluginPath.value = ''
  } catch (error) {
    localInstallError.value = error instanceof Error ? error.message : String(error)
  } finally {
    localInstallLoading.value = false
  }
}

function closeLocalInstallDialog(): void {
  localInstallDialogOpen.value = false
  localInstallError.value = null
}
</script>

<template>
  <section class="space-y-4">
    <PanelCard
      title="Plugins"
      description="Search Synra npm plugin packages and browse built-in or installed plugins."
    >
      <PluginSearchBar
        v-model:keyword="keyword"
        :loading="loading"
        @search="refreshCatalog"
        @local-install="localInstallDialogOpen = true"
      />
    </PanelCard>
    <PanelCard v-if="error">
      <p class="text-sm text-error-4">{{ error }}</p>
    </PanelCard>
    <PanelCard>
      <PluginCardGrid
        :plugins="filteredPlugins"
        :sync-supported="pluginBridgeAvailable"
        :is-plugin-reloading="isPluginReloading"
        @open="openPlugin"
        @sync-request="openSyncDialog"
        @remove-request="onPluginRemoveRequest"
        @reload-local-request="onReloadLocalRequest"
      />
    </PanelCard>
    <div
      v-if="localInstallDialogOpen"
      class="fixed inset-0 z-[80] flex items-center justify-center bg-black/65 px-4 backdrop-blur-sm"
    >
      <div
        class="w-full max-w-xl rounded-2xl border border-white/14 bg-slate-950/92 p-5 shadow-2xl shadow-black/50"
      >
        <h3 class="text-lg font-semibold text-slate-100">Install Local Plugin</h3>
        <p class="mt-2 text-sm text-muted-2">
          Enter a local plugin package path. The folder must contain a valid package.json and built
          dist files.
        </p>
        <input
          v-model="localPluginPath"
          class="app-focus-ring mt-4 w-full rounded-lg border border-white/15 bg-white/6 px-3 py-2 text-sm text-slate-100 placeholder:text-muted-4"
          placeholder="C:/path/to/plugin or C:/path/to/plugin/package"
          @keyup.enter="submitLocalInstall"
        />
        <p v-if="localInstallError" class="mt-2 text-xs text-error-7">{{ localInstallError }}</p>
        <div class="mt-4 flex justify-end gap-2">
          <AppButton :disabled="localInstallLoading" @click="closeLocalInstallDialog">
            Cancel
          </AppButton>
          <AppButton
            variant="solid"
            :disabled="localInstallLoading || !localPluginPath.trim()"
            @click="submitLocalInstall"
          >
            {{ localInstallLoading ? 'Installing...' : 'Install' }}
          </AppButton>
        </div>
      </div>
    </div>
    <div
      v-if="syncDialogOpen && syncDialogPlugin"
      class="fixed inset-0 z-[80] flex items-center justify-center bg-black/65 px-4 backdrop-blur-sm"
    >
      <div
        class="w-full max-w-xl rounded-2xl border border-white/14 bg-slate-950/92 p-5 shadow-2xl shadow-black/50"
      >
        <h3 class="text-lg font-semibold text-slate-100">
          Sync “{{ syncDialogPlugin.name }}” to devices
        </h3>
        <p class="mt-2 text-sm text-muted-2">
          Only devices with an open transport are listed. Peers that already have the same version
          are skipped after preflight.
        </p>
        <ul
          v-if="syncableDisplayDevices.length > 0"
          class="mt-4 max-h-56 space-y-2 overflow-y-auto text-sm text-slate-200"
        >
          <li
            v-for="device in syncableDisplayDevices"
            :key="device.deviceId"
            class="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2"
          >
            <input
              :id="`sync-device-${device.deviceId}`"
              type="checkbox"
              class="app-focus-ring rounded border-white/20"
              :checked="syncSelectedIds.includes(device.deviceId)"
              @change="toggleSyncDevice(device.deviceId)"
            />
            <label :for="`sync-device-${device.deviceId}`" class="min-w-0 flex-1 cursor-pointer">
              <span class="block truncate font-medium">{{ device.name || device.deviceId }}</span>
              <span class="text-xs text-muted-3">{{ device.deviceId }}</span>
            </label>
          </li>
        </ul>
        <p v-else class="mt-4 text-sm text-muted-3">
          No connected devices. Open a transport from the Connect page first.
        </p>
        <p v-if="syncProgress" class="mt-3 text-xs text-muted-3">
          Progress: {{ syncProgress.done }} / {{ syncProgress.total }}
        </p>
        <p v-if="syncFeedback" class="mt-2 text-xs text-muted-2">{{ syncFeedback }}</p>
        <div class="mt-4 flex justify-end gap-2">
          <AppButton :disabled="syncBusy" @click="closeSyncDialog">Cancel</AppButton>
          <AppButton
            variant="solid"
            :disabled="
              syncBusy || syncSelectedIds.length === 0 || syncableDisplayDevices.length === 0
            "
            @click="submitPluginSync"
          >
            {{ syncBusy ? 'Syncing…' : 'Sync' }}
          </AppButton>
        </div>
      </div>
    </div>
  </section>
</template>
