<script setup lang="ts">
const appVersion = __APP_VERSION__
</script>

<template>
  <section class="fccc min-h-[68vh] gap-4 text-center">
    <div class="glass-panel-soft max-w-xl px-8 py-10">
      <p class="text-xs tracking-[0.2em] text-primary-3">DESKTOP WORKSPACE</p>
      <h1 class="mt-3 text-4xl font-semibold tracking-tight text-slate-100">Synra</h1>
      <p class="mt-2 text-sm text-muted-2">Dark glass shell is active.</p>
      <RouterLink to="/devices" class="mt-6 inline-block">
        <AppButton variant="solid">Open devices</AppButton>
      </RouterLink>
      <p class="mt-5 text-xs text-muted-4">version {{ appVersion }}</p>
    </div>
  </section>
</template>
