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
    class="chat-msg-scroll min-h-0 flex-1 space-y-2 overflow-auto px-1 py-2 sm:px-2"
  >
    <div v-if="loading && messages.length === 0" class="py-6 text-center text-xs text-slate-500">
      加载中…
    </div>

    <div
      v-else-if="messages.length === 0"
      class="py-10 text-center text-xs leading-relaxed text-slate-500"
    >
      暂无消息，连接设备后即可开始对话。
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
        class="max-w-[min(92%,28rem)] rounded-2xl px-3 py-2 text-sm leading-snug"
        :class="
          message.direction === 'outgoing'
            ? 'bg-indigo-500/80 text-white'
            : message.direction === 'incoming'
              ? 'bg-white/[0.08] text-slate-100'
              : 'bg-white/[0.05] text-xs text-slate-400'
        "
      >
        <p class="break-words whitespace-pre-wrap">{{ message.text }}</p>
        <p
          class="mt-1 text-end text-[10px] tabular-nums opacity-70"
          :class="message.direction === 'outgoing' ? 'text-indigo-50' : 'text-slate-400'"
        >
          {{ message.timeLabel }}
          <template v-if="message.direction === 'outgoing'"> · {{ message.status }}</template>
        </p>
      </div>
    </article>
  </div>
</template>

<style scoped>
.chat-msg-scroll::-webkit-scrollbar {
  width: 0;
}
.chat-msg-scroll:hover::-webkit-scrollbar {
  width: 6px;
}
.chat-msg-scroll::-webkit-scrollbar-thumb {
  border-radius: 9999px;
  background: rgba(148, 163, 184, 0.3);
}
</style>
