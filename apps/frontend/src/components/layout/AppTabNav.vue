<script setup lang="ts">
type TabItem = {
  label: string;
  to: string;
};

const props = defineProps<{
  tabs: TabItem[];
  activePath: string;
}>();

function isActive(target: string): boolean {
  return target === "/" ? props.activePath === "/" : props.activePath.startsWith(target);
}
</script>

<template>
  <nav class="mb-4 rounded-lg border border-gray-200 bg-white p-2 md:mb-6">
    <div class="flex gap-2 overflow-x-auto whitespace-nowrap pb-1">
      <RouterLink
        v-for="tab in tabs"
        :key="tab.to"
        :to="tab.to"
        class="shrink-0 rounded-md px-3 py-2 text-sm font-medium transition md:px-4"
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
</template>
