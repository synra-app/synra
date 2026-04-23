import type { SynraMessageType } from '@synra/protocol'

export type RuntimeSessionState = {
  state: 'idle' | 'connecting' | 'open' | 'closed' | 'error'
  sessionId?: string
  deviceId?: string
  host?: string
  port?: number
  direction?: 'inbound' | 'outbound'
  lastError?: string
  openedAt?: number
  closedAt?: number
}

/** Physical TCP + Synra transport: `ready` means socket is up and usable for frames. */
export type TransportLinkState = 'idle' | 'handshaking' | 'ready' | 'dead'

/** Application-level link (pairing, gating, UI). Does not imply TCP is open. */
export type AppLinkState = 'disconnected' | 'pending' | 'connected' | 'failed'

export type RuntimeConnectedSession = {
  sessionId: string
  transport: TransportLinkState
  app: AppLinkState
  deviceId?: string
  host?: string
  port?: number
  openedAt?: number
  closedAt?: number
  lastActiveAt?: number
  direction?: 'inbound' | 'outbound'
  lastAppError?: string
}

export type RuntimeOpenSessionInput = {
  deviceId: string
  host: string
  port: number
  /**
   * When true, `openSession` failures do not populate the shared transport `error` ref (best-effort
   * auto-reconnect while the peer host is still starting its listener).
   */
  suppressGlobalError?: boolean
}

export type SynraDiscoveryStartOptions = {
  includeLoopback?: boolean
  manualTargets?: string[]
  enableProbeFallback?: boolean
  discoveryMode?: 'hybrid' | 'mdns' | 'subnet' | 'manual'
  mdnsServiceType?: string
  subnetCidrs?: string[]
  maxProbeHosts?: number
  concurrency?: number
  discoveryTimeoutMs?: number
  reset?: boolean
  port?: number
  timeoutMs?: number
}

export type SynraConnectionMessage = {
  eventId: string
  sessionId: string
  messageType: SynraMessageType
  payload: unknown
  messageId?: string
  timestamp: number
  deviceId?: string
}

export type SynraConnectionFilter = {
  sessionId?: string
  deviceId?: string
  messageType?: SynraMessageType
}

export type SynraConnectionSendInput = {
  sessionId: string
  messageType: SynraMessageType
  payload: unknown
  messageId?: string
}
