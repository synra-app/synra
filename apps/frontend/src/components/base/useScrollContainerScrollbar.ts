import { computed, nextTick, onBeforeUnmount, onMounted, onUpdated, ref, type Ref } from 'vue'

export function useScrollContainerScrollbar(
  rootRef: Ref<HTMLElement | null>,
  viewportRef: Ref<HTMLElement | null>,
  thumbMinSize: Ref<number>
) {
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
      thumbHeight.value = thumbMinSize.value
      thumbOffset.value = 0
      return
    }

    const trackHeight = getTrackHeight()
    const proportionalHeight = (viewport.clientHeight / viewport.scrollHeight) * trackHeight
    const nextThumbHeight = Math.max(thumbMinSize.value, Math.min(trackHeight, proportionalHeight))
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

  return {
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
  }
}
