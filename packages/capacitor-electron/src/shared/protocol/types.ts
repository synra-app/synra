import type { PluginAction, ShareInput } from '@synra/plugin-sdk'
import type {
  PluginCatalogItem,
  PluginCatalogRequestPayload,
  SynraMessageType,
  SynraActionReceipt,
  SynraRuntimeMessage
} from '@synra/protocol'
import type { BridgeErrorCode } from '../errors/codes'
import type { BridgeMethod } from './constants'

export type BridgeRequestMeta = {
  timeoutMs?: number
  source?: 'capacitor-webview'
  traceId?: string
}

export type BridgeRequest<TPayload = unknown> = {
  protocolVersion: string
  requestId: string
  method: BridgeMethod | (string & {})
  payload: TPayload
  meta?: BridgeRequestMeta
}

export type BridgeSuccessResponse<TData = unknown> = {
  ok: true
  requestId: string
  data: TData
}

export type BridgeErrorResponse = {
  ok: false
  requestId: string
  error: {
    code: BridgeErrorCode
    message: string
    details?: unknown
  }
}

export type BridgeResponse<TData = unknown> = BridgeSuccessResponse<TData> | BridgeErrorResponse

export type RuntimeInfo = {
  protocolVersion: string
  supportedProtocolVersions: string[]
  capacitorVersion: string
  electronVersion: string
  nodeVersion: string
  platform: NodeJS.Platform
  capabilities: string[]
}

export type OperationResult = {
  success: true
}

export type OpenExternalOptions = {
  url: string
}

export type ReadFileOptions = {
  path: string
  encoding?: BufferEncoding
}

export type ReadFileResult = {
  content: string
  encoding: BufferEncoding
}

export type RuntimeActionCandidate = {
  pluginId: string
  pluginVersion: string
  pluginLabel: string
  score: number
  reason?: string
  action: PluginAction
}

export type ResolveRuntimeActionsOptions = {
  input: ShareInput
}

export type ResolveRuntimeActionsResult = {
  candidates: RuntimeActionCandidate[]
}

export type RuntimeExecuteOptions = {
  sessionId: string
  input: ShareInput
  action: PluginAction
  messageId?: string
  traceId?: string
  timeoutMs?: number
}

export type RuntimeExecuteResult = {
  messages: SynraRuntimeMessage[]
  receipt: SynraActionReceipt
}

export type PluginCatalogResult = {
  plugins: PluginCatalogItem[]
  generatedAt: number
}

export type DiscoverySource = 'mdns' | 'probe' | 'manual' | 'session'
export type DiscoveryMode = 'hybrid' | 'mdns' | 'subnet' | 'manual'

export type DiscoveryState = 'idle' | 'scanning'

export type DiscoveredDevice = {
  deviceId: string
  name: string
  ipAddress: string
  source: DiscoverySource
  connectable: boolean
  connectCheckAt?: number
  connectCheckError?: string
  discoveredAt: number
  lastSeenAt: number
}

export type DeviceDiscoveryStartOptions = {
  includeLoopback?: boolean
  manualTargets?: string[]
  enableProbeFallback?: boolean
  discoveryMode?: DiscoveryMode
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

export type DeviceDiscoveryStartResult = {
  requestId: string
  state: DiscoveryState
  startedAt?: number
  scanWindowMs: number
  devices: DiscoveredDevice[]
}

export type DeviceDiscoveryListResult = {
  state: DiscoveryState
  startedAt?: number
  scanWindowMs: number
  devices: DiscoveredDevice[]
}

export type DeviceDiscoveryProbeConnectableOptions = {
  port?: number
  timeoutMs?: number
}

export type DeviceDiscoveryProbeConnectableResult = {
  checkedAt: number
  port: number
  timeoutMs: number
  devices: DiscoveredDevice[]
}

export type DeviceSessionOpenOptions = {
  deviceId: string
  host: string
  port: number
  token?: string
  transport?: ConnectionTransport
}

export type DeviceSessionState = 'idle' | 'connecting' | 'open' | 'closed' | 'error'
export type ConnectionTransport = 'tcp'

export type DeviceSessionSnapshot = {
  sessionId?: string
  deviceId?: string
  host?: string
  port?: number
  state: DeviceSessionState
  transport?: ConnectionTransport
  lastError?: string
  openedAt?: number
  closedAt?: number
}

export type DeviceSessionOpenResult = {
  success: true
  sessionId: string
  state: DeviceSessionState
  transport?: ConnectionTransport
}

export type DeviceSessionCloseOptions = {
  sessionId?: string
  transport?: ConnectionTransport
}

export type DeviceSessionCloseResult = {
  success: true
  sessionId?: string
  transport?: ConnectionTransport
}

export type DeviceSessionSendMessageOptions = {
  sessionId: string
  messageType: SynraMessageType
  payload: unknown
  messageId?: string
  transport?: ConnectionTransport
}

export type DeviceSessionSendMessageResult = {
  success: true
  messageId: string
  sessionId: string
  transport?: ConnectionTransport
}

export type DeviceSessionGetStateOptions = {
  sessionId?: string
  transport?: ConnectionTransport
}

export type DeviceDiscoveryHostEvent = {
  id: number
  timestamp: number
  type:
    | 'transport.session.opened'
    | 'transport.session.closed'
    | 'transport.message.received'
    | 'transport.message.ack'
    | 'transport.error'
    | 'host.retire'
    | 'host.member.offline'
    | 'host.heartbeat.timeout'
  remote: string
  sessionId?: string
  messageId?: string
  messageType?: SynraMessageType
  code?: string
  payload?: unknown
  transport?: ConnectionTransport
}

export type DeviceDiscoveryPullHostEventsResult = {
  events: DeviceDiscoveryHostEvent[]
}

export type MethodPayloadMap = {
  'runtime.getInfo': Record<string, never>
  'runtime.resolveActions': ResolveRuntimeActionsOptions
  'runtime.execute': RuntimeExecuteOptions
  'plugin.catalog.get': PluginCatalogRequestPayload
  'external.open': OpenExternalOptions
  'file.read': ReadFileOptions
  'discovery.start': DeviceDiscoveryStartOptions
  'discovery.stop': Record<string, never>
  'discovery.list': Record<string, never>
  'discovery.probeConnectable': DeviceDiscoveryProbeConnectableOptions
  'discovery.openSession': DeviceSessionOpenOptions
  'discovery.closeSession': DeviceSessionCloseOptions
  'discovery.sendMessage': DeviceSessionSendMessageOptions
  'discovery.getSessionState': DeviceSessionGetStateOptions
  'discovery.pullHostEvents': Record<string, never>
  'connection.openSession': DeviceSessionOpenOptions
  'connection.closeSession': DeviceSessionCloseOptions
  'connection.sendMessage': DeviceSessionSendMessageOptions
  'connection.getSessionState': DeviceSessionGetStateOptions
  'connection.pullHostEvents': Record<string, never>
  'preferences.get': { key: string }
  'preferences.set': { key: string; value: string }
  'preferences.remove': { key: string }
}

export type MethodResultMap = {
  'runtime.getInfo': RuntimeInfo
  'runtime.resolveActions': ResolveRuntimeActionsResult
  'runtime.execute': RuntimeExecuteResult
  'plugin.catalog.get': PluginCatalogResult
  'external.open': OperationResult
  'file.read': ReadFileResult
  'discovery.start': DeviceDiscoveryStartResult
  'discovery.stop': OperationResult
  'discovery.list': DeviceDiscoveryListResult
  'discovery.probeConnectable': DeviceDiscoveryProbeConnectableResult
  'discovery.openSession': DeviceSessionOpenResult
  'discovery.closeSession': DeviceSessionCloseResult
  'discovery.sendMessage': DeviceSessionSendMessageResult
  'discovery.getSessionState': DeviceSessionSnapshot
  'discovery.pullHostEvents': DeviceDiscoveryPullHostEventsResult
  'connection.openSession': DeviceSessionOpenResult
  'connection.closeSession': DeviceSessionCloseResult
  'connection.sendMessage': DeviceSessionSendMessageResult
  'connection.getSessionState': DeviceSessionSnapshot
  'connection.pullHostEvents': DeviceDiscoveryPullHostEventsResult
  'preferences.get': { value: string | null }
  'preferences.set': OperationResult
  'preferences.remove': OperationResult
}
