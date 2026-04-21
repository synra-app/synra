import { computed, ref, type ComputedRef, type Ref } from 'vue'
import type { ChatMessage, ChatSession } from '../src/types/chat'
import type { SynraHookSendMessageInput } from '@synra/plugin-sdk/hooks'
import { resolveErrorMessage } from './chatPayload'

export function useChatSendPipeline(options: {
  selectedSession: ComputedRef<ChatSession | undefined>
  canSendBySession: ComputedRef<boolean>
  messageInput: Ref<string>
  messageType: Ref<SynraHookSendMessageInput['messageType']>
  localError: Ref<string | null>
  sendMessage: (input: {
    sessionId: string
    messageType: SynraHookSendMessageInput['messageType']
    payload: string
    messageId: string
  }) => Promise<void>
  failedMessageIds: Ref<Set<string>>
  pendingMessages: Ref<ChatMessage[]>
}): {
  sending: Ref<boolean>
  canSend: ComputedRef<boolean>
  onSendMessage: () => Promise<void>
} {
  const {
    selectedSession,
    canSendBySession,
    messageInput,
    messageType,
    localError,
    sendMessage,
    failedMessageIds,
    pendingMessages
  } = options

  const sending = ref(false)

  const canSend = computed(
    () => canSendBySession.value && !sending.value && messageInput.value.trim().length > 0
  )

  async function onSendMessage(): Promise<void> {
    if (!canSend.value || !selectedSession.value) {
      return
    }

    const content = messageInput.value.trim()
    const optimisticMessageId = `local-${Date.now()}-${Math.random().toString(16).slice(2)}`
    pendingMessages.value.push({
      id: optimisticMessageId,
      sessionId: selectedSession.value.sessionId,
      messageId: optimisticMessageId,
      direction: 'outgoing',
      text: content,
      messageType: messageType.value,
      timestamp: Date.now(),
      timeLabel: new Date().toLocaleTimeString(),
      status: 'sending'
    })
    messageInput.value = ''
    localError.value = null
    sending.value = true
    try {
      await sendMessage({
        sessionId: selectedSession.value.sessionId,
        messageType: messageType.value,
        payload: content,
        messageId: optimisticMessageId
      })
    } catch (unknownError) {
      failedMessageIds.value = new Set(failedMessageIds.value).add(optimisticMessageId)
      pendingMessages.value = pendingMessages.value.map((message) =>
        message.messageId === optimisticMessageId ? { ...message, status: 'failed' } : message
      )
      localError.value = resolveErrorMessage(unknownError, 'Failed to send message.')
    } finally {
      sending.value = false
    }
  }

  return {
    sending,
    canSend,
    onSendMessage
  }
}
