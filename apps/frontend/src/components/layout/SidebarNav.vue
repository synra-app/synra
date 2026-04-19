<script setup lang="ts">
type SidebarItem = {
  label: string
  icon: string
  to: string
}

defineProps<{
  items: SidebarItem[]
  currentPath: string
}>()

const emit = defineEmits<{
  closeMobile: []
}>()
</script>

<template>
  <nav class="relative flex h-full w-72 flex-col gap-4 overflow-hidden p-4">
    <div class="flex items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <span class="fcc h-8 w-8 rounded-lg bg-primary/20 text-primary">
          <span class="i-lucide-sparkles text-xl" />
        </span>
        <span class="text-lg font-semibold">Synra</span>
      </div>
      <button
        class="inline-flex rounded-md border border-surface-5 p-1.5 text-muted-6 lg:hidden"
        aria-label="Close sidebar"
        @click="emit('closeMobile')"
      >
        <span class="i-lucide-x" />
      </button>
    </div>

    <ul class="space-y-1">
      <li v-for="item in items" :key="item.to">
        <RouterLink
          :to="item.to"
          class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-200"
          :class="
            currentPath === item.to || currentPath.startsWith(`${item.to}/`)
              ? 'bg-primary text-white'
              : 'text-muted-6 hover:bg-surface-2'
          "
          @click="emit('closeMobile')"
        >
          <span class="fcc h-5 w-5 text-lg" :class="item.icon" />
          <span class="whitespace-nowrap">
            {{ item.label }}
          </span>
        </RouterLink>
      </li>
    </ul>
  </nav>
</template>
