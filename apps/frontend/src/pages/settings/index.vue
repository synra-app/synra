<script setup lang="ts">
import AppButton from '../../components/base/AppButton.vue'

const { aboutInfo, copyDiagnostics, copyMessage, copyStatus, refreshNow } = useAboutInfo()
</script>

<template>
  <section class="space-y-4">
    <PanelCard title="Settings" description="Application and runtime information for diagnostics.">
      <div class="flex flex-wrap gap-2">
        <AppButton variant="solid" @click="refreshNow"> Refresh info </AppButton>
        <AppButton @click="copyDiagnostics"> Copy diagnostics JSON </AppButton>
      </div>
      <p
        v-if="copyStatus !== 'idle'"
        class="text-sm"
        :class="copyStatus === 'success' ? 'text-success-4' : 'text-error-4'"
      >
        {{ copyMessage }}
      </p>
    </PanelCard>

    <PanelCard title="About">
      <dl class="space-y-3 text-sm">
        <div
          v-for="item in aboutInfo"
          :key="item.label"
          class="grid grid-cols-1 gap-1 rounded-xl border border-white/12 bg-white/5 p-3 md:grid-cols-[220px_1fr]"
        >
          <dt class="font-semibold text-muted-2">{{ item.label }}</dt>
          <dd class="break-all text-muted-1">{{ item.value }}</dd>
        </div>
      </dl>
    </PanelCard>
  </section>
</template>
