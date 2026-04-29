<script setup lang="ts">
import AppButton from '../../components/base/AppButton.vue'
import {
  PLUGIN_REGISTRY_SOURCE_OPTIONS,
  createDefaultPluginRegistryPreferences,
  loadPluginRegistryPreferences,
  normalizeRegistryUrl,
  resolveRegistryUrlFromPreferences,
  savePluginRegistryPreferences,
  type PluginRegistrySourceId
} from '../../lib/plugin-registry-preferences'

type SaveStatus = 'idle' | 'saving' | 'success' | 'error'

const sourceId = ref<PluginRegistrySourceId>('npm')
const useCustomRegistry = ref(false)
const customRegistryUrl = ref('')
const saveStatus = ref<SaveStatus>('idle')
const statusMessage = ref('')
const effectiveRegistryUrl = ref(
  resolveRegistryUrlFromPreferences(createDefaultPluginRegistryPreferences())
)

const isBusy = computed(() => saveStatus.value === 'saving')

function updateEffectiveRegistryUrl(): void {
  try {
    effectiveRegistryUrl.value = resolveRegistryUrlFromPreferences({
      sourceId: sourceId.value,
      useCustomRegistry: useCustomRegistry.value,
      customRegistryUrl: customRegistryUrl.value
    })
    if (saveStatus.value === 'error') {
      saveStatus.value = 'idle'
      statusMessage.value = ''
    }
  } catch (error: unknown) {
    effectiveRegistryUrl.value = ''
    if (saveStatus.value !== 'saving') {
      saveStatus.value = 'error'
      statusMessage.value = error instanceof Error ? error.message : 'Registry URL is invalid.'
    }
  }
}

async function loadPreferences(): Promise<void> {
  saveStatus.value = 'idle'
  statusMessage.value = ''
  const preferences = await loadPluginRegistryPreferences()
  sourceId.value = preferences.sourceId
  useCustomRegistry.value = preferences.useCustomRegistry
  customRegistryUrl.value = preferences.customRegistryUrl
  updateEffectiveRegistryUrl()
}

async function savePreferences(): Promise<void> {
  if (saveStatus.value === 'saving') {
    return
  }
  saveStatus.value = 'saving'
  statusMessage.value = ''

  try {
    const customUrl = useCustomRegistry.value ? normalizeRegistryUrl(customRegistryUrl.value) : ''
    await savePluginRegistryPreferences({
      sourceId: sourceId.value,
      useCustomRegistry: useCustomRegistry.value,
      customRegistryUrl: customUrl
    })
    customRegistryUrl.value = customUrl
    updateEffectiveRegistryUrl()
    saveStatus.value = 'success'
    statusMessage.value = 'Plugin registry settings saved.'
  } catch (error: unknown) {
    saveStatus.value = 'error'
    statusMessage.value =
      error instanceof Error ? error.message : 'Failed to save plugin registry settings.'
  }
}

watch([sourceId, useCustomRegistry, customRegistryUrl], () => {
  updateEffectiveRegistryUrl()
})

onMounted(() => {
  void loadPreferences()
})
</script>

<template>
  <PanelCard
    title="Plugin"
    description="Choose the npm registry source used by plugin catalog refresh and plugin installation."
  >
    <label class="block">
      <span class="mb-1 block font-semibold text-muted-1">Registry source</span>
      <select
        v-model="sourceId"
        class="app-focus-ring w-full rounded-lg border border-white/14 bg-white/6 px-3 py-2 text-slate-100"
      >
        <option
          v-for="option in PLUGIN_REGISTRY_SOURCE_OPTIONS"
          :key="option.id"
          :value="option.id"
          class="bg-slate-900"
        >
          {{ option.label }} ({{ option.url }})
        </option>
      </select>
    </label>

    <label class="flex items-center gap-2">
      <input
        v-model="useCustomRegistry"
        type="checkbox"
        class="h-4 w-4 rounded border-white/20 bg-white/8 text-primary-4"
      />
      <span class="text-sm text-muted-2">Use custom registry URL</span>
    </label>

    <label class="block">
      <span class="mb-1 block font-semibold text-muted-1">Custom registry URL</span>
      <input
        v-model="customRegistryUrl"
        :disabled="!useCustomRegistry"
        class="app-focus-ring w-full rounded-lg border border-white/14 bg-white/6 px-3 py-2 text-slate-100 placeholder:text-muted-4 disabled:cursor-not-allowed disabled:opacity-60"
        type="text"
        placeholder="https://registry.example.com/npm"
      />
    </label>

    <p class="text-sm text-muted-3">
      New plugin searches and installs use this registry. Existing installed plugin files stay
      unchanged.
    </p>
    <p class="text-sm text-muted-2">
      Effective registry:
      <span class="font-mono text-xs text-muted-1">{{ effectiveRegistryUrl || '-' }}</span>
    </p>

    <div class="flex flex-wrap gap-2">
      <AppButton
        variant="solid"
        :disabled="isBusy || !effectiveRegistryUrl"
        @click="savePreferences"
      >
        Save
      </AppButton>
      <AppButton :disabled="isBusy" @click="loadPreferences"> Reload </AppButton>
    </div>

    <p
      v-if="statusMessage"
      class="text-sm"
      :class="saveStatus === 'error' ? 'text-error-4' : 'text-success-4'"
    >
      {{ statusMessage }}
    </p>
  </PanelCard>
</template>
