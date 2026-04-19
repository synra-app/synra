<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import type { ChatMessage } from '../../src/types/chat'

const props = defineProps<{
  messages: ChatMessage[]
  loading: boolean
}>()

const containerRef = ref<HTMLElement | null>(null)
const firstRenderCompleted = ref(false)

function isNearBottom(target: HTMLElement): boolean {
  const threshold = 72
  return target.scrollHeight - target.scrollTop - target.clientHeight < threshold
}

function scrollToBottom(): void {
  if (!containerRef.value) {
    return
  }
  containerRef.value.scrollTop = containerRef.value.scrollHeight
}

watch(
  () => props.messages.length,
  () => {
    if (!containerRef.value) {
      return
    }
    if (!firstRenderCompleted.value) {
      firstRenderCompleted.value = true
      nextTick(() => {
        scrollToBottom()
      })
      return
    }
    if (isNearBottom(containerRef.value)) {
      nextTick(() => {
        scrollToBottom()
      })
    }
  },
  { immediate: true }
)
</script>

<template>
  <div
    ref="containerRef"
    class="h-[45vh] min-h-64 space-y-3 overflow-auto rounded-lg border border-gray-200 bg-gray-50 p-3 md:h-[52vh]"
  >
    <div v-if="loading && messages.length === 0" class="text-center text-sm text-gray-500">
      Loading chat...
    </div>

    <div v-else-if="messages.length === 0" class="text-center text-sm text-gray-500">
      No messages yet. Start chatting when a device session is ready.
    </div>

    <article
      v-for="message in messages"
      :key="message.id"
      class="flex"
      :class="
        message.direction === 'outgoing'
          ? 'justify-end'
          : message.direction === 'incoming'
            ? 'justify-start'
            : 'justify-center'
      "
    >
      <div
        class="max-w-[80%] rounded-2xl px-3 py-2 text-sm"
        :class="
          message.direction === 'outgoing'
            ? 'rounded-br-md bg-blue-600 text-white'
            : message.direction === 'incoming'
              ? 'rounded-bl-md border border-gray-200 bg-white text-gray-900'
              : 'border border-gray-200 bg-gray-100 text-xs text-gray-600'
        "
      >
        <p class="break-words whitespace-pre-wrap">{{ message.text }}</p>
        <footer
          class="mt-1 flex items-center justify-end gap-2 text-[10px]"
          :class="
            message.direction === 'outgoing'
              ? 'text-blue-100'
              : message.direction === 'incoming'
                ? 'text-gray-500'
                : 'justify-center text-gray-500'
          "
        >
          <span>{{ message.timeLabel }}</span>
          <span v-if="message.direction === 'outgoing'">{{ message.status }}</span>
        </footer>
      </div>
    </article>
  </div>
</template>
