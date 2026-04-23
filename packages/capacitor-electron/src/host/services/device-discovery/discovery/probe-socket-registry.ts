import type { Socket } from 'node:net'
import type { LengthPrefixedJsonCodec } from '../protocol/lan-frame.codec'

export type ProbeSocketLease = {
  socket: Socket
  codec: LengthPrefixedJsonCodec
  /** Synra session id from connect / connectAck. */
  sessionId: string
  displayName?: string
}

export type ProbeSocketRegistry = {
  register(key: string, lease: ProbeSocketLease): void
  take(key: string): ProbeSocketLease | undefined
  /**
   * If a lease is still registered under `key`, removes it and destroys the socket.
   * No-op when the key is absent (e.g. already taken by outbound).
   */
  releaseIfHeld(key: string): void
  /** Closes and removes entries whose keys are not in keepKeys. */
  closeStale(keepKeys: Set<string>): void
  closeAll(): void
}

export function createProbeSocketRegistry(): ProbeSocketRegistry {
  const map = new Map<string, ProbeSocketLease>()
  return {
    register(key: string, lease: ProbeSocketLease) {
      const existing = map.get(key)
      if (existing && existing.socket !== lease.socket) {
        existing.socket.destroy()
      }
      map.set(key, lease)
    },
    take(key: string) {
      const v = map.get(key)
      if (!v) {
        return undefined
      }
      map.delete(key)
      return v
    },
    releaseIfHeld(key: string) {
      const v = map.get(key)
      if (!v) {
        return
      }
      map.delete(key)
      v.socket.destroy()
    },
    closeStale(keepKeys: Set<string>) {
      const toRemove: string[] = []
      for (const k of map.keys()) {
        if (!keepKeys.has(k)) {
          toRemove.push(k)
        }
      }
      for (const k of toRemove) {
        const v = map.get(k)
        if (v) {
          v.socket.destroy()
          map.delete(k)
        }
      }
    },
    closeAll() {
      for (const v of map.values()) {
        v.socket.destroy()
      }
      map.clear()
    }
  }
}
