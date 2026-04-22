<script setup lang="ts">
import SynraTabPanel from '../../components/base/SynraTabPanel.vue'
import SynraTabs from '../../components/base/SynraTabs.vue'
import type { SynraTabItem } from '../../components/base/SynraTabs.vue'
import AboutPage from './about.vue'
import BasicPage from './basic.vue'
import DevelopmentPage from './development.vue'

type SettingsTabName = 'basic' | 'about' | 'development'

const settingsTabs: SynraTabItem[] = [
  { name: 'basic', label: 'Basic Info' },
  { name: 'about', label: 'About' },
  { name: 'development', label: 'Development' }
]

const activeSettingsTab = ref<SettingsTabName>('basic')
</script>

<template>
  <section class="space-y-4">
    <SynraTabs v-model="activeSettingsTab" :tabs="settingsTabs" aria-label="Settings sections" />
    <SynraTabPanel name="basic" :active-name="activeSettingsTab">
      <BasicPage />
    </SynraTabPanel>
    <SynraTabPanel name="about" :active-name="activeSettingsTab">
      <AboutPage />
    </SynraTabPanel>
    <SynraTabPanel name="development" :active-name="activeSettingsTab">
      <DevelopmentPage />
    </SynraTabPanel>
  </section>
</template>
