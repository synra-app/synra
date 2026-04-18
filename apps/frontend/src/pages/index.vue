<script setup lang="ts">
import { computed } from "vue";

type CapacitorWindow = Window & {
  Capacitor?: {
    getPlatform?: () => string;
    isNativePlatform?: () => boolean;
  };
};

const runtime = window as CapacitorWindow;
const platform = runtime.Capacitor?.getPlatform?.() ?? "web";
const isNative = runtime.Capacitor?.isNativePlatform?.() ?? false;
const hasElectronBridge = Boolean(window.__synraCapElectron?.invoke);

const platformLabel = computed(() => {
  if (hasElectronBridge) {
    return "electron";
  }
  if (isNative) {
    return platform;
  }
  return "web";
});
</script>

<template>
  <section>
    <div class="rounded-lg border border-gray-200 bg-white p-4 text-sm">
      <p><strong>Platform:</strong> {{ platformLabel }}</p>
      <p><strong>Capacitor Platform:</strong> {{ platform }}</p>
      <p><strong>Is Native:</strong> {{ isNative ? "yes" : "no" }}</p>
      <p><strong>Electron Bridge:</strong> {{ hasElectronBridge ? "available" : "unavailable" }}</p>
    </div>
  </section>
</template>
