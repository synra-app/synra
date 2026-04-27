/**
 * True when the peer closed or reset the TCP connection (e.g. remote app quit).
 * These should not surface as user-visible transport failures.
 */
export function isBenignTcpPeerDisconnect(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }
  const withCode = error as { code?: unknown }
  if (typeof withCode.code === 'string') {
    if (withCode.code === 'ECONNRESET' || withCode.code === 'EPIPE') {
      return true
    }
  }
  if (!(error instanceof Error)) {
    return false
  }
  const msg = error.message.toLowerCase()
  return (
    msg.includes('econnreset') ||
    msg.includes('epipe') ||
    msg.includes('econnaborted') ||
    msg.includes('socket hang up')
  )
}
