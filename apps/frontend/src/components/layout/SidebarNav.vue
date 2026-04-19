<script setup lang="ts">
import AppButton from '../base/AppButton.vue'

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
  <nav class="relative flex h-full flex-col gap-3 overflow-hidden">
    <div class="flex justify-end pb-1">
      <AppButton
        class="lg:hidden"
        size="icon"
        aria-label="Close sidebar"
        @click="emit('closeMobile')"
      >
        <span class="i-lucide-x" />
      </AppButton>
    </div>

    <ul class="space-y-1.5">
      <li v-for="item in items" :key="item.to">
        <RouterLink
          :to="item.to"
          class="app-focus-ring flex items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-sm transition-all duration-200"
          :class="
            currentPath === item.to || currentPath.startsWith(`${item.to}/`)
              ? 'border-primary-4/35 bg-primary/22 text-slate-100'
              : 'text-muted-2 hover:border-white/15 hover:bg-white/7'
          "
          @click="emit('closeMobile')"
        >
          <span class="fcc h-5 w-5 text-base" :class="item.icon" />
          <span class="whitespace-nowrap">
            {{ item.label }}
          </span>
        </RouterLink>
      </li>
    </ul>
  </nav>
</template>
