import type {
  SynraConnectionFilter,
  SynraConnectionMessage,
  SynraConnectionSendInput
} from '../types'
import { getConnectionRuntime } from '../runtime/core'

export function useConnection() {
  const runtime = getConnectionRuntime()

  return {
    sendMessage: (input: SynraConnectionSendInput) => runtime.sendMessage(input),
    onMessage: (
      handler: (message: SynraConnectionMessage) => void | Promise<void>,
      filter?: SynraConnectionFilter
    ) => runtime.onMessage(handler, filter),
    ensureListeners: () => runtime.ensureListeners()
  }
}
