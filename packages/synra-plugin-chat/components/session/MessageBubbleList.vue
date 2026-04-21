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
    class="app-scroll-container h-[45vh] min-h-64 space-y-3 overflow-auto rounded-xl border border-white/12 bg-[#0b1020]/68 p-3 md:h-[52vh]"
  >
    <div v-if="loading && messages.length === 0" class="text-center text-sm text-slate-400">
      Loading chat...
    </div>

    <div v-else-if="messages.length === 0" class="text-center text-sm text-slate-400">
      No messages yet. Start chatting after connecting a device.
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
            ? 'rounded-br-md border border-indigo-300/30 bg-indigo-500/85 text-white shadow-[0_8px_20px_rgba(79,70,229,0.35)]'
            : message.direction === 'incoming'
              ? 'rounded-bl-md border border-white/14 bg-white/10 text-slate-100'
              : 'border border-white/12 bg-white/8 text-xs text-slate-300'
        "
      >
        <p class="break-words whitespace-pre-wrap">{{ message.text }}</p>
        <footer
          class="mt-1 flex items-center justify-end gap-2 text-[10px]"
          :class="
            message.direction === 'outgoing'
              ? 'text-indigo-100'
              : message.direction === 'incoming'
                ? 'text-slate-300'
                : 'justify-center text-slate-400'
          "
        >
          <span>{{ message.timeLabel }}</span>
          <span v-if="message.direction === 'outgoing'">{{ message.status }}</span>
        </footer>
      </div>
    </article>
  </div>
</template>

<style scoped>
.app-scroll-container::-webkit-scrollbar {
  width: 0;
}

.app-scroll-container:hover::-webkit-scrollbar {
  width: 8px;
}

.app-scroll-container::-webkit-scrollbar-track {
  background: transparent;
}

.app-scroll-container::-webkit-scrollbar-thumb {
  border-radius: 9999px;
  background: rgba(148, 163, 184, 0.52);
}
</style>
