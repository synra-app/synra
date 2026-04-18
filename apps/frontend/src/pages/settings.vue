<script setup lang="ts">
const { aboutInfo, copyDiagnostics, copyMessage, copyStatus, refreshNow } = useAboutInfo();
</script>

<template>
  <section class="space-y-4">
    <PanelCard title="Settings" description="Application and runtime information for diagnostics.">
      <div class="flex flex-wrap gap-2">
        <button class="rounded-md bg-gray-900 px-3 py-2 text-sm text-white" @click="refreshNow">
          Refresh Info
        </button>
        <button
          class="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-800"
          @click="copyDiagnostics"
        >
          Copy Diagnostics JSON
        </button>
      </div>
      <p
        v-if="copyStatus !== 'idle'"
        class="text-sm"
        :class="copyStatus === 'success' ? 'text-green-700' : 'text-red-600'"
      >
        {{ copyMessage }}
      </p>
    </PanelCard>

    <PanelCard title="About">
      <dl class="space-y-3 text-sm">
        <div
          v-for="item in aboutInfo"
          :key="item.label"
          class="grid grid-cols-1 gap-1 rounded-md border border-gray-200 p-3 md:grid-cols-[220px_1fr]"
        >
          <dt class="font-semibold text-gray-700">{{ item.label }}</dt>
          <dd class="break-all text-gray-900">{{ item.value }}</dd>
        </div>
      </dl>
    </PanelCard>
  </section>
</template>
