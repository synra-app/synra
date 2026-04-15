<script setup lang="ts">
import { ref } from "vue";

const loading = ref(false);
const runtimeInfo = ref<string>("Not loaded.");
const errorMessage = ref<string>("");

async function loadRuntimeInfo(): Promise<void> {
  loading.value = true;
  errorMessage.value = "";

  try {
    if (!window.__synraCapElectron?.invoke) {
      throw new Error("Electron bridge is not available. Open this page in the Electron app.");
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
  if (!window.__synraCapElectron?.invoke) {
    errorMessage.value = "Electron bridge is not available.";
    return;
  }

  try {
    await window.__synraCapElectron.invoke("external.open", { url: "https://synra.dev" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errorMessage.value = message;
  }
}
</script>

<template>
  <section class="space-y-4">
    <h1 class="text-3xl font-bold">Capacitor Electron Demo</h1>
    <p class="text-gray-600">Minimal demo page for validating the Electron bridge integration.</p>

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
