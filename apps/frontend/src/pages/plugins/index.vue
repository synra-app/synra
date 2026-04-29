<script setup lang="ts">
import AppButton from '../../components/base/AppButton.vue'

const {
  error,
  filteredPlugins,
  installPluginFromLocalPath,
  keyword,
  loading,
  openPlugin,
  refreshCatalog
} = usePluginCatalog()
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
      <PluginCardGrid :plugins="filteredPlugins" @open="openPlugin" />
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
  </section>
</template>
