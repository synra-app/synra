<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, onUpdated, ref, useTemplateRef } from 'vue'

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

const isHovered = ref(false)
const isFocused = ref(false)
const isScrolling = ref(false)
const isScrollable = ref(false)
const thumbHeight = ref(28)
const thumbOffset = ref(0)

const dragState = ref<{
  pointerId: number
  startY: number
  startScrollTop: number
} | null>(null)

let resizeObserver: ResizeObserver | undefined
let scrollIdleTimer: ReturnType<typeof setTimeout> | undefined

const trackVisible = computed(
  () => isScrollable.value && (isHovered.value || isFocused.value || isScrolling.value)
)

function clearScrollIdleTimer(): void {
  if (!scrollIdleTimer) {
    return
  }
  clearTimeout(scrollIdleTimer)
  scrollIdleTimer = undefined
}

function getTrackHeight(): number {
  const viewport = viewportRef.value
  if (!viewport) {
    return 0
  }
  return Math.max(0, viewport.clientHeight - 8)
}

function syncMetrics(): void {
  const viewport = viewportRef.value
  if (!viewport) {
    return
  }

  const scrollRange = viewport.scrollHeight - viewport.clientHeight
  isScrollable.value = scrollRange > 0

  if (!isScrollable.value) {
    thumbHeight.value = props.thumbMinSize
    thumbOffset.value = 0
    return
  }

  const trackHeight = getTrackHeight()
  const proportionalHeight = (viewport.clientHeight / viewport.scrollHeight) * trackHeight
  const nextThumbHeight = Math.max(props.thumbMinSize, Math.min(trackHeight, proportionalHeight))
  thumbHeight.value = nextThumbHeight

  const maxThumbOffset = Math.max(0, trackHeight - nextThumbHeight)
  const nextThumbOffset = (viewport.scrollTop / scrollRange) * maxThumbOffset
  thumbOffset.value = Number.isFinite(nextThumbOffset) ? nextThumbOffset : 0
}

function updateOnScroll(): void {
  isScrolling.value = true
  clearScrollIdleTimer()
  scrollIdleTimer = setTimeout(() => {
    isScrolling.value = false
  }, 420)
  syncMetrics()
}

function onTrackPointerDown(event: PointerEvent): void {
  const viewport = viewportRef.value
  if (!viewport || !isScrollable.value) {
    return
  }
  const track = event.currentTarget as HTMLElement
  const rect = track.getBoundingClientRect()
  const clickY = event.clientY - rect.top
  const targetThumbCenter = clickY - thumbHeight.value / 2
  const maxThumbOffset = Math.max(0, rect.height - thumbHeight.value)
  const clampedThumbOffset = Math.max(0, Math.min(maxThumbOffset, targetThumbCenter))
  const ratio = maxThumbOffset > 0 ? clampedThumbOffset / maxThumbOffset : 0
  viewport.scrollTop = ratio * (viewport.scrollHeight - viewport.clientHeight)
  syncMetrics()
}

function onThumbPointerDown(event: PointerEvent): void {
  const viewport = viewportRef.value
  if (!viewport || !isScrollable.value) {
    return
  }
  dragState.value = {
    pointerId: event.pointerId,
    startY: event.clientY,
    startScrollTop: viewport.scrollTop
  }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

function onThumbPointerMove(event: PointerEvent): void {
  const viewport = viewportRef.value
  const state = dragState.value
  if (!viewport || !state || state.pointerId !== event.pointerId) {
    return
  }
  const trackHeight = getTrackHeight()
  const maxThumbOffset = Math.max(0, trackHeight - thumbHeight.value)
  if (maxThumbOffset <= 0) {
    return
  }
  const deltaY = event.clientY - state.startY
  const scrollRange = viewport.scrollHeight - viewport.clientHeight
  viewport.scrollTop = state.startScrollTop + (deltaY / maxThumbOffset) * scrollRange
}

function onThumbPointerUp(event: PointerEvent): void {
  const state = dragState.value
  if (!state || state.pointerId !== event.pointerId) {
    return
  }
  dragState.value = null
  ;(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId)
}

function onViewportKeydown(event: KeyboardEvent): void {
  const viewport = viewportRef.value
  if (!viewport || !isScrollable.value) {
    return
  }

  const pageStep = Math.max(48, Math.round(viewport.clientHeight * 0.9))

  if (event.key === 'PageDown') {
    event.preventDefault()
    viewport.scrollBy({ top: pageStep, behavior: 'auto' })
    return
  }
  if (event.key === 'PageUp') {
    event.preventDefault()
    viewport.scrollBy({ top: -pageStep, behavior: 'auto' })
    return
  }
  if (event.key === 'Home') {
    event.preventDefault()
    viewport.scrollTo({ top: 0, behavior: 'auto' })
    return
  }
  if (event.key === 'End') {
    event.preventDefault()
    viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'auto' })
  }
}

onMounted(() => {
  void nextTick(() => {
    syncMetrics()
  })

  resizeObserver = new ResizeObserver(() => {
    syncMetrics()
  })
  if (rootRef.value) {
    resizeObserver.observe(rootRef.value)
  }
  if (viewportRef.value) {
    resizeObserver.observe(viewportRef.value)
  }
})

onUpdated(() => {
  syncMetrics()
})

onBeforeUnmount(() => {
  clearScrollIdleTimer()
  resizeObserver?.disconnect()
})
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
