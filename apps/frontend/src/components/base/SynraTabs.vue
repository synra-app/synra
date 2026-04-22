<script setup lang="ts">
export type SynraTabItem = {
  name: string
  label: string
}

const props = withDefaults(
  defineProps<{
    tabs: SynraTabItem[]
    modelValue: string
    ariaLabel?: string
  }>(),
  {
    ariaLabel: undefined
  }
)

const emit = defineEmits<{
  'update:modelValue': [name: string]
}>()

function select(name: string): void {
  emit('update:modelValue', name)
}
</script>

<template>
  <div class="app-scroll-tabs w-full min-w-0">
    <div class="app-scroll-tabs__track" role="tablist" :aria-label="ariaLabel">
      <button
        v-for="tab in tabs"
        :key="tab.name"
        type="button"
        role="tab"
        :aria-selected="modelValue === tab.name"
        class="shrink-0 rounded-t-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors"
        :class="
          modelValue === tab.name
            ? 'bg-white/10 text-white'
            : 'text-muted-2 hover:bg-white/5 hover:text-muted-1'
        "
        @click="select(tab.name)"
      >
        {{ tab.label }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.app-scroll-tabs {
  margin-left: -0.25rem;
  margin-right: -0.25rem;
  margin-bottom: 1rem;
  padding-bottom: 0.25rem;
  border-bottom: 1px solid rgb(255 255 255 / 0.12);
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.app-scroll-tabs::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}

.app-scroll-tabs__track {
  display: flex;
  flex-wrap: nowrap;
  gap: 0.25rem;
  width: max-content;
  min-width: 100%;
  padding-left: 0.25rem;
  padding-right: 0.25rem;
}
</style>
