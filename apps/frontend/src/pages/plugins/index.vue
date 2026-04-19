<script setup lang="ts">
const { error, filteredPlugins, keyword, loading, openPlugin, refreshCatalog } = usePluginCatalog()
</script>

<template>
  <section class="space-y-4">
    <PanelCard title="Plugins" description="Browse built-in and installed plugins.">
      <PluginSearchBar v-model:keyword="keyword" :loading="loading" @search="refreshCatalog" />
    </PanelCard>
    <PanelCard v-if="error">
      <p class="text-sm text-error-7">{{ error }}</p>
    </PanelCard>
    <PanelCard>
      <PluginCardGrid :plugins="filteredPlugins" @open="openPlugin" />
    </PanelCard>
  </section>
</template>
