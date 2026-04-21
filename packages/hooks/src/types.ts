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

export type RuntimeConnectedSession = {
  sessionId: string
  status?: 'open' | 'closed'
  deviceId?: string
  host?: string
  port?: number
  openedAt?: number
  closedAt?: number
  lastActiveAt?: number
  direction?: 'inbound' | 'outbound'
}

export type RuntimeOpenSessionInput = {
  deviceId: string
  host: string
  port: number
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
