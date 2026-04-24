import type { SynraLanConnectType } from '@synra/capacitor-device-connection'
import type { SynraMessageType } from '@synra/protocol'

export type RuntimeSessionState = {
  state: 'idle' | 'connecting' | 'open' | 'closed' | 'error'
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

/** Application-level link (pairing, gating, UI). Does not imply TCP is open or any specific color. */
export type AppLinkState = 'disconnected' | 'pending' | 'connected' | 'failed'

export type RuntimeConnectedSession = {
  deviceId: string
  transport: TransportLinkState
  app: AppLinkState
  host?: string
  port?: number
  openedAt?: number
  closedAt?: number
  lastActiveAt?: number
  direction?: 'inbound' | 'outbound'
  lastAppError?: string
}

export type RuntimeOpenTransportInput = {
  deviceId: string
  host: string
  port: number
  /** Overrides `resolveSynraConnectType` from hooks runtime options when set. */
  connectType?: SynraLanConnectType
  /**
   * When true, `openTransport` failures do not populate the shared transport `error` ref (best-effort
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
  /** Merged into each Synra probe `connect` payload (Capacitor + Electron discovery). */
  probeConnectWirePayload?: Record<string, unknown>
}

export type SynraConnectionMessage = {
  eventId: string
  requestId: string
  sourceDeviceId: string
  targetDeviceId: string
  replyToRequestId?: string
  messageType: SynraMessageType
  payload: unknown
  messageId?: string
  timestamp: number
}

export type SynraConnectionFilter = {
  requestId?: string
  deviceId?: string
  messageType?: SynraMessageType
}

export type SynraConnectionSendInput = {
  requestId: string
  sourceDeviceId: string
  targetDeviceId: string
  replyToRequestId?: string
  messageType: SynraMessageType
  payload: unknown
  messageId?: string
}

export type SynraLanWireEvent = {
  requestId: string
  sourceDeviceId: string
  targetDeviceId: string
  replyToRequestId?: string
  eventName: string
  payload: unknown
  transport: 'tcp'
}

export type SynraLanWireFilter = {
  requestId?: string
  deviceId?: string
  eventName?: string
}

export type SynraLanWireSendInput = {
  requestId: string
  sourceDeviceId: string
  targetDeviceId: string
  replyToRequestId?: string
  eventName: string
  payload?: unknown
  eventId?: string
  schemaVersion?: number
}
