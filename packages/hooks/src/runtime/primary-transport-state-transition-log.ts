import type { Ref } from 'vue'
import type { RuntimePrimaryTransportState } from '../types'

export function setPrimaryTransportStateWithTransitionLog(
  primaryTransportState: Ref<RuntimePrimaryTransportState>,
  nextState: RuntimePrimaryTransportState,
  _meta: { reason: string }
): void {
  primaryTransportState.value = nextState
}
