import { createConnectionRuntime, type ConnectionRuntime } from './create-connection-runtime'
import { resolveRuntimeAdapter } from './resolve-adapter'

export type { ConnectionRuntime } from './create-connection-runtime'

let runtimeSingleton: ConnectionRuntime | null = null

export function getConnectionRuntime(): ConnectionRuntime {
  if (!runtimeSingleton) {
    runtimeSingleton = createConnectionRuntime(resolveRuntimeAdapter())
  }
  return runtimeSingleton
}

export function resetConnectionRuntime(): void {
  runtimeSingleton = null
}
