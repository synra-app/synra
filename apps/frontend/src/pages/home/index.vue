<script setup lang="ts">
const appVersion = __APP_VERSION__
</script>

<template>
  <section class="flex min-h-[70vh] flex-col items-center justify-center gap-2 text-center">
    <h1 class="text-4xl font-semibold tracking-tight">Synra</h1>
    <p class="text-sm text-muted-5">version {{ appVersion }}</p>
  </section>
</template>
