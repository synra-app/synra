<script setup lang="ts">
const { aboutInfo, copyDiagnostics, copyMessage, copyStatus, refreshNow } = useAboutInfo();
</script>

<template>
  <section class="space-y-4">
    <PanelCard title="Settings" description="Application and runtime information for diagnostics.">
      <div class="flex flex-wrap gap-2">
        <button class="rounded-md bg-primary px-3 py-2 text-sm text-white" @click="refreshNow">
          Refresh info
        </button>
        <button
          class="rounded-md border border-surface-5 px-3 py-2 text-sm text-muted-7"
          @click="copyDiagnostics"
        >
          Copy diagnostics JSON
        </button>
      </div>
      <p
        v-if="copyStatus !== 'idle'"
        class="text-sm"
        :class="copyStatus === 'success' ? 'text-success-7' : 'text-error-7'"
      >
        {{ copyMessage }}
      </p>
    </PanelCard>

    <PanelCard title="About">
      <dl class="space-y-3 text-sm">
        <div
          v-for="item in aboutInfo"
          :key="item.label"
          class="grid grid-cols-1 gap-1 rounded-md border border-surface-3 p-3 md:grid-cols-[220px_1fr]"
        >
          <dt class="font-semibold text-muted-6">{{ item.label }}</dt>
          <dd class="break-all text-muted-8">{{ item.value }}</dd>
        </div>
      </dl>
    </PanelCard>
  </section>
</template>
