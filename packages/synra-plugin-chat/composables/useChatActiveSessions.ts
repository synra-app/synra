import { computed, type ComputedRef, type Ref } from 'vue'
import type { SynraHookConnectedSession } from '@synra/plugin-sdk/hooks'
import type { ChatSession } from '../src/types/chat'

export function useChatActiveSessions(
  rawActiveSessions: Ref<readonly SynraHookConnectedSession[]>
): {
  activeSessions: ComputedRef<ChatSession[]>
} {
  const activeSessions = computed<ChatSession[]>(() =>
    rawActiveSessions.value.map((session) => ({
      sessionId: session.sessionId,
      deviceId: typeof session.deviceId === 'string' ? session.deviceId : undefined,
      host: typeof session.host === 'string' ? session.host : undefined,
      port: typeof session.port === 'number' ? session.port : undefined,
      remote: typeof session.remote === 'string' ? session.remote : undefined,
      direction: typeof session.direction === 'string' ? session.direction : undefined,
      status: typeof session.status === 'string' ? session.status : undefined,
      openedAt: typeof session.openedAt === 'number' ? session.openedAt : undefined,
      closedAt: typeof session.closedAt === 'number' ? session.closedAt : undefined,
      lastActiveAt:
        typeof session.lastActiveAt === 'number'
          ? new Date(session.lastActiveAt).toLocaleTimeString()
          : undefined
    }))
  )

  return { activeSessions }
}
