<script setup lang="ts">
import { useRoute } from "vue-router";

const route = useRoute();

const tabs = [
  { label: "Home", to: "/" },
  { label: "System Info Demo", to: "/electron-demo" },
];

const isActive = (target: string): boolean =>
  target === "/" ? route.path === "/" : route.path.startsWith(target);
</script>

<template>
  <main class="mx-auto max-w-3xl p-6">
    <nav class="mb-6 rounded-lg border border-gray-200 bg-white p-2">
      <div class="flex gap-2">
        <RouterLink
          v-for="tab in tabs"
          :key="tab.to"
          :to="tab.to"
          class="rounded-md px-4 py-2 text-sm font-medium transition"
          :class="
            isActive(tab.to)
              ? 'bg-gray-900 text-white'
              : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
          "
        >
          {{ tab.label }}
        </RouterLink>
      </div>
    </nav>

    <RouterView />
  </main>
</template>
