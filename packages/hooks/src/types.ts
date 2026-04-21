import type { Ref } from 'vue'
import type { DiscoveredDevice } from '@synra/capacitor-lan-discovery'
import type { SynraMessageType } from '@synra/protocol'

export type SynraHookDevice = {
  deviceId: string
  ipAddress?: string
  name?: string
  source?: string
  lastSeenAt?: number
  connectable?: boolean
  [key: string]: unknown
}

export type SynraHookSessionState = {
  state: string
  sessionId?: string
  deviceId?: string
  [key: string]: unknown
}

export type SynraHookConnectedSession = {
  sessionId: string
  status?: string
  deviceId?: string
  lastActiveAt?: number
  [key: string]: unknown
}

export type SynraHookEventLog = {
  id?: string
  type: string
  payload: unknown
  timestamp: number
}

export type SynraHookSendMessageInput = {
  sessionId: string
  messageType: SynraMessageType
  payload: unknown
  messageId?: string
}

export type SynraDiscoveryStartMode = 'hybrid' | 'mdns' | 'subnet' | 'manual'

export type SynraDiscoveryStartOptions = {
  includeLoopback?: boolean
  manualTargets?: string[]
  enableProbeFallback?: boolean
  discoveryMode?: SynraDiscoveryStartMode
  mdnsServiceType?: string
  subnetCidrs?: string[]
  maxProbeHosts?: number
  concurrency?: number
  discoveryTimeoutMs?: number
  reset?: boolean
  scanWindowMs?: number
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

export type SynraConnectionSendInput = SynraHookSendMessageInput & {
  deviceId?: string
}

export type SynraConnectionRuntimeState = {
  scanState: Ref<string>
  startedAt: Ref<number | undefined>
  scanWindowMs: Ref<number>
  devices: Ref<DiscoveredDevice[]>
  loading: Ref<boolean>
  error: Ref<string | null>
  sessionState: Ref<SynraHookSessionState>
  connectedSessions: Ref<SynraHookConnectedSession[]>
  eventLogs: Ref<SynraHookEventLog[]>
}
