import type { Ref } from 'vue'
import type { SynraMessageType } from '@synra/protocol'

export type SynraHookDevice = {
  deviceId: string
  paired?: boolean
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

export type SynraHooksAdapter = {
  scanState: Ref<string>
  startedAt: Ref<number | undefined>
  scanWindowMs: Ref<number>
  devices: Ref<SynraHookDevice[]>
  loading: Ref<boolean>
  error: Ref<string | null>
  sessionState: Ref<SynraHookSessionState>
  connectedSessions: Ref<SynraHookConnectedSession[]>
  eventLogs: Ref<SynraHookEventLog[]>
  ensureListeners(): Promise<void>
  startDiscovery(options?: string[] | SynraDiscoveryStartOptions): Promise<void>
  stopDiscovery(): Promise<void>
  refreshDevices(): Promise<void>
  pairDevice(deviceId: string): Promise<void>
  probeConnectable(port?: number, timeoutMs?: number): Promise<void>
  openSession(options: {
    deviceId: string
    host: string
    port: number
    transport?: 'tcp'
  }): Promise<void>
  closeSession(sessionId?: string): Promise<void>
  syncSessionState(sessionId?: string): Promise<void>
  sendMessage(input: SynraHookSendMessageInput): Promise<void>
}

export type SynraHooksAdapterFactory = () => SynraHooksAdapter
