<script setup lang="ts">
import { computed, useAttrs } from 'vue'

const props = withDefaults(
  defineProps<{
    variant?: 'ghost' | 'solid' | 'danger'
    size?: 'sm' | 'md' | 'icon'
    block?: boolean
    type?: 'button' | 'submit' | 'reset'
    disabled?: boolean
  }>(),
  {
    variant: 'ghost',
    size: 'md',
    block: false,
    type: 'button',
    disabled: false
  }
)

const attrs = useAttrs()

const sizeClass = computed(() => {
  if (props.size === 'icon') {
    return 'h-8 min-w-8 px-2 text-sm'
  }
  if (props.size === 'sm') {
    return 'px-3 py-1.5 text-sm'
  }
  return 'px-3.5 py-2 text-sm'
})

const variantClass = computed(() => {
  if (props.variant === 'solid') {
    return 'border border-primary-4/35 bg-primary/24 text-slate-100 hover:bg-primary/32'
  }
  if (props.variant === 'danger') {
    return 'border border-red-300/35 bg-transparent text-red-100 hover:bg-red-500/20'
  }
  return 'border border-transparent bg-transparent text-muted-1 hover:border-white/14 hover:bg-white/12 hover:backdrop-blur-lg'
})

const classes = computed(() => {
  const blockClass = props.block ? 'w-full justify-center' : ''
  return [
    'app-focus-ring inline-flex items-center gap-1.5 rounded-lg transition-all duration-200 active:scale-95',
    sizeClass.value,
    variantClass.value,
    blockClass,
    props.disabled ? 'cursor-not-allowed opacity-50' : ''
  ]
})
</script>

<template>
  <button :type="type" :disabled="disabled" :class="classes" v-bind="attrs">
    <slot />
  </button>
</template>
