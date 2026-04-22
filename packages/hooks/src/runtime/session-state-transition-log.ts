import type { Ref } from 'vue'
import type { RuntimeSessionState } from '../types'

export function setSessionStateWithTransitionLog(
  sessionState: Ref<RuntimeSessionState>,
  nextState: RuntimeSessionState,
  _meta: { reason: string }
): void {
  sessionState.value = nextState
}
