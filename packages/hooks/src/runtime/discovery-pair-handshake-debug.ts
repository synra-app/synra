import { getHooksRuntimeOptions } from './config'

const TAG = '[discovery-pair-debug]'

function isDiscoveryPairHandshakeDebugEnabled(): boolean {
  if (getHooksRuntimeOptions().enableDiscoveryPairHandshakeDebug === true) {
    return true
  }
  try {
    if (
      typeof process !== 'undefined' &&
      typeof process.env !== 'undefined' &&
      process.env.SYNRA_DEBUG_PAIR_HANDSHAKE === '1'
    ) {
      return true
    }
  } catch {
    /* no process (browser) */
  }
  try {
    const g = globalThis as { __SYNRA_DEBUG_PAIR_HANDSHAKE?: boolean }
    if (g.__SYNRA_DEBUG_PAIR_HANDSHAKE === true) {
      return true
    }
    if (
      typeof localStorage !== 'undefined' &&
      localStorage.getItem('SYNRA_DEBUG_PAIR_HANDSHAKE') === '1'
    ) {
      return true
    }
  } catch {
    /* private mode */
  }
  return false
}

/** JSON one-liner for Safari / Chrome / Logcat filtering on `[discovery-pair-debug]`. */
export function logDiscoveryPairHandshakeDebug(phase: string, data: Record<string, unknown>): void {
  if (!isDiscoveryPairHandshakeDebugEnabled()) {
    return
  }
  const line = { ts: Date.now(), phase, ...data }
  console.info(TAG, JSON.stringify(line))
}
