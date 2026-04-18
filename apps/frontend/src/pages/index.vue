<script setup lang="ts">
import { Capacitor } from "@capacitor/core";
import { computed } from "vue";

const platform = Capacitor.getPlatform();
const isNative = Capacitor.isNativePlatform();
const hasElectronBridge = Boolean(window.__synraCapElectron?.invoke);

const platformLabel = computed(() => platform);
</script>

<template>
  <section class="space-y-4">
    <div class="rounded-lg border border-gray-200 bg-white p-4 text-sm space-y-2">
      <h1 class="text-lg font-semibold">Synra Home</h1>
      <p class="text-gray-600">
        Use the <strong>Connection</strong> tab to scan LAN devices, connect, and send messages.
      </p>
      <p><strong>Platform:</strong> {{ platformLabel }}</p>
      <p><strong>Capacitor Platform:</strong> {{ platform }}</p>
      <p><strong>Is Native:</strong> {{ isNative ? "yes" : "no" }}</p>
      <p><strong>Electron Bridge:</strong> {{ hasElectronBridge ? "available" : "unavailable" }}</p>
    </div>
  </section>
</template>
