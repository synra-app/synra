<script setup lang="ts">
type SidebarItem = {
  label: string
  icon: string
  to: string
}

defineProps<{
  items: SidebarItem[]
  currentPath: string
  collapsed: boolean
}>()

const emit = defineEmits<{
  toggleCollapse: []
  closeMobile: []
}>()
</script>

<template>
  <nav
    class="relative flex h-full flex-col gap-4 overflow-hidden p-4 transition-[width] duration-200 ease-in-out"
    :class="collapsed ? 'w-20' : 'w-72'"
  >
    <button
      class="absolute right-3 top-3 hidden rounded-md border border-surface-5 p-1.5 text-muted-6 lg:inline-flex"
      aria-label="Toggle sidebar"
      @click="emit('toggleCollapse')"
    >
      <span :class="collapsed ? 'i-lucide-panel-left-open' : 'i-lucide-panel-left-close'" />
    </button>

    <div class="flex items-center justify-between gap-2">
      <div class="flex items-center gap-2 pt-8 lg:pt-0">
        <span class="h-8 w-8 rounded-lg bg-primary/20 p-1.5 text-xl text-primary">
          <span class="i-lucide-sparkles h-full w-full" />
        </span>
        <span v-if="!collapsed" class="text-lg font-semibold"> Synra </span>
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
          <span class="text-lg" :class="item.icon" />
          <span
            class="whitespace-nowrap transition-opacity duration-200"
            :class="collapsed ? 'opacity-0 lg:hidden' : 'opacity-100'"
          >
            {{ item.label }}
          </span>
        </RouterLink>
      </li>
    </ul>
  </nav>
</template>
