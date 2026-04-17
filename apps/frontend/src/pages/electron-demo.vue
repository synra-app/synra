<script setup lang="ts">
import { computed, ref } from "vue";

const loading = ref(false);
const runtimeInfo = ref<string>("Not loaded.");
const errorMessage = ref<string>("");
const hasElectronBridge = computed(() => Boolean(window.__synraCapElectron?.invoke));

type CapacitorWindow = Window & {
  Capacitor?: {
    getPlatform?: () => string;
    isNativePlatform?: () => boolean;
  };
};

async function loadRuntimeInfo(): Promise<void> {
  loading.value = true;
  errorMessage.value = "";

  try {
    if (!hasElectronBridge.value) {
      const capacitorWindow = window as CapacitorWindow;
      const platform = capacitorWindow.Capacitor?.getPlatform?.() ?? "web";
      const isNative = capacitorWindow.Capacitor?.isNativePlatform?.() ?? false;
      runtimeInfo.value = JSON.stringify(
        {
          bridge: "web-fallback",
          platform,
          isNativePlatform: isNative,
          userAgent: navigator.userAgent,
        },
        null,
        2,
      );
      return;
    }

    const result = await window.__synraCapElectron.invoke("runtime.getInfo", {});
    runtimeInfo.value = JSON.stringify(result, null, 2);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errorMessage.value = message;
  } finally {
    loading.value = false;
  }
}

async function openSynraWebsite(): Promise<void> {
  try {
    if (hasElectronBridge.value) {
      await window.__synraCapElectron.invoke("external.open", { url: "https://synra.dev" });
      return;
    }

    window.open("https://synra.dev", "_blank", "noopener,noreferrer");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errorMessage.value = message;
  }
}
</script>

<template>
  <section class="space-y-4">
    <h1 class="text-3xl font-bold">Capacitor Electron Demo</h1>
    <p class="text-gray-600">
      Minimal demo page for validating bridge behavior across Electron and Capacitor.
    </p>
    <p v-if="!hasElectronBridge" class="text-sm text-amber-700">
      Running without Electron bridge. Using web fallback behavior.
    </p>

    <div class="flex gap-3">
      <button
        class="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
        :disabled="loading"
        @click="loadRuntimeInfo"
      >
        {{ loading ? "Loading..." : "Get Runtime Info" }}
      </button>
      <button class="rounded border border-gray-300 px-4 py-2" @click="openSynraWebsite">
        Open synra.dev
      </button>
    </div>

    <p v-if="errorMessage" class="text-sm text-red-600">{{ errorMessage }}</p>

    <pre class="overflow-auto rounded bg-gray-900 p-4 text-sm text-gray-100">{{ runtimeInfo }}</pre>
  </section>
</template>
