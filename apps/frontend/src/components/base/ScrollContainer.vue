<script setup lang="ts">
import { toRef, useTemplateRef } from 'vue'
import { useScrollContainerScrollbar } from './useScrollContainerScrollbar'

const props = withDefaults(
  defineProps<{
    as?: string
    viewportClass?: string
    thumbMinSize?: number
  }>(),
  {
    as: 'div',
    viewportClass: '',
    thumbMinSize: 20
  }
)

const rootRef = useTemplateRef<HTMLElement>('rootRef')
const viewportRef = useTemplateRef<HTMLElement>('viewportRef')
const thumbMinSizeRef = toRef(props, 'thumbMinSize')

const {
  isHovered,
  isFocused,
  trackVisible,
  thumbHeight,
  thumbOffset,
  updateOnScroll,
  onTrackPointerDown,
  onThumbPointerDown,
  onThumbPointerMove,
  onThumbPointerUp,
  onViewportKeydown
} = useScrollContainerScrollbar(rootRef, viewportRef, thumbMinSizeRef)
</script>

<template>
  <component
    :is="as"
    ref="rootRef"
    class="scroll-container relative min-h-0 overflow-hidden"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
    @focusin="isFocused = true"
    @focusout="isFocused = false"
  >
    <div
      ref="viewportRef"
      class="scroll-container__viewport min-h-0 overflow-auto"
      :class="viewportClass"
      tabindex="0"
      @scroll="updateOnScroll"
      @keydown="onViewportKeydown"
    >
      <slot />
    </div>

    <div
      class="scroll-container__track"
      :class="trackVisible ? 'opacity-100' : 'opacity-0'"
      @pointerdown="onTrackPointerDown"
    >
      <div
        class="scroll-container__thumb"
        :style="{
          height: `${thumbHeight}px`,
          transform: `translateY(${thumbOffset}px)`
        }"
        @pointerdown.stop.prevent="onThumbPointerDown"
        @pointermove.stop.prevent="onThumbPointerMove"
        @pointerup.stop.prevent="onThumbPointerUp"
        @pointercancel.stop.prevent="onThumbPointerUp"
      />
    </div>
  </component>
</template>

<style scoped>
.scroll-container__viewport {
  --scroll-mask-size: 16px;
  scrollbar-width: none;
  -ms-overflow-style: none;
  -webkit-mask-image: linear-gradient(
    to bottom,
    transparent,
    #000 var(--scroll-mask-size),
    #000 calc(100% - var(--scroll-mask-size)),
    transparent
  );
  mask-image: linear-gradient(
    to bottom,
    transparent,
    #000 var(--scroll-mask-size),
    #000 calc(100% - var(--scroll-mask-size)),
    transparent
  );
  -webkit-mask-size: 100% 100%;
  mask-size: 100% 100%;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
}

.scroll-container__viewport::-webkit-scrollbar {
  width: 0;
  height: 0;
}

.scroll-container__track {
  position: absolute;
  top: 3px;
  right: 3px;
  bottom: 3px;
  width: 5px;
  border-radius: 999px;
  pointer-events: auto;
  transition: opacity 220ms ease;
}

.scroll-container__thumb {
  width: 100%;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.56);
  transition: background-color 200ms ease;
}

.scroll-container__track:hover .scroll-container__thumb {
  background: rgba(148, 163, 184, 0.72);
}
</style>
