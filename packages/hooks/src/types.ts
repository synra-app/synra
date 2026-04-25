import type { SynraLanConnectType } from '@synra/capacitor-device-connection'
import type { LanWireEventName } from '@synra/protocol'

export type RuntimePrimaryTransportState = {
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

export type RuntimeOpenTransportLink = {
  deviceId: string
  transport: TransportLinkState
  host?: string
  port?: number
  openedAt?: number
  closedAt?: number
  lastActiveAt?: number
  direction?: 'inbound' | 'outbound'
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
  event: string
  target: string
  from: string
  replyRequestId?: string
  payload: unknown
  timestamp: number
}

export type SynraConnectionFilter = {
  requestId?: string
  deviceId?: string
  event?: string
}

export type SynraConnectionSendInput = {
  requestId: string
  event: string
  target: string
  from: string
  replyRequestId?: string
  payload: unknown
  timestamp?: number
}

export type SendMessageToReadyDeviceInput = {
  deviceId: string
  event: string
  payload: unknown
  from?: string
  replyRequestId?: string
  timestamp?: number
}

export type TransportBroadcastMessageInput = {
  event: string
  payload: unknown
  from?: string
}

export type SynraLanWireEvent = {
  requestId: string
  event: LanWireEventName
  target: string
  from: string
  replyRequestId?: string
  payload: unknown
  timestamp: number
  transport: 'tcp'
}

export type SynraLanWireFilter = {
  requestId?: string
  deviceId?: string
  event?: LanWireEventName
}

export type SynraLanWireSendInput = {
  requestId: string
  event: LanWireEventName
  target: string
  from: string
  replyRequestId?: string
  payload?: unknown
  timestamp?: number
}
