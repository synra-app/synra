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
  /** Prefer non-link-local IPv4 for LAN pairing (Electron main). */
  primaryDiscoveryIpv4?: string
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
  requestId: string
  sourceDeviceId: string
  targetDeviceId: string
  replyToRequestId?: string
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
  port?: number
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
  port?: number
  timeoutMs?: number
  /** Merged into each Synra TCP probe `connect` payload during this discovery run. */
  probeConnectWirePayload?: Record<string, unknown>
}

export type DeviceDiscoveryStartResult = {
  requestId: string
  state: DiscoveryState
  devices: DiscoveredDevice[]
}

export type DeviceDiscoveryListResult = {
  state: DiscoveryState
  devices: DiscoveredDevice[]
}

export type SynraLanConnectType = 'fresh' | 'paired'

export type DeviceTransportOpenOptions = {
  deviceId: string
  host: string
  port: number
  token?: string
  /** Sent on Synra `connect` payload as `connectType`; caller must set. */
  connectType: SynraLanConnectType
  transport?: ConnectionTransport
}

export type DeviceTransportState = 'idle' | 'connecting' | 'open' | 'closed' | 'error'
export type ConnectionTransport = 'tcp'

export type DeviceTransportSnapshot = {
  deviceId?: string
  host?: string
  port?: number
  state: DeviceTransportState
  direction?: 'inbound' | 'outbound'
  transport?: ConnectionTransport
  lastError?: string
  openedAt?: number
  closedAt?: number
}

export type DeviceTransportOpenResult = {
  success: true
  deviceId: string
  state: DeviceTransportState
  transport?: ConnectionTransport
}

export type DeviceTransportCloseOptions = {
  targetDeviceId?: string
  transport?: ConnectionTransport
}

export type DeviceTransportCloseResult = {
  success: true
  targetDeviceId?: string
  transport?: ConnectionTransport
}

export type DeviceTransportSendMessageOptions = {
  requestId: string
  sourceDeviceId: string
  targetDeviceId: string
  replyToRequestId?: string
  messageType: SynraMessageType
  payload: unknown
  messageId?: string
  transport?: ConnectionTransport
}

export type DeviceTransportSendMessageResult = {
  success: true
  messageId: string
  targetDeviceId: string
  transport?: ConnectionTransport
}

export type DeviceTransportSendLanEventOptions = {
  requestId: string
  sourceDeviceId: string
  targetDeviceId: string
  replyToRequestId?: string
  eventName: string
  payload?: unknown
  eventId?: string
  schemaVersion?: number
  transport?: ConnectionTransport
}

export type DeviceTransportSendLanEventResult = {
  success: true
  targetDeviceId: string
  transport?: ConnectionTransport
}

export type DeviceTransportGetStateOptions = {
  targetDeviceId?: string
  transport?: ConnectionTransport
}

export type DeviceDiscoveryHostEvent = {
  id: number
  timestamp: number
  type:
    | 'transport.opened'
    | 'transport.closed'
    | 'transport.message.received'
    | 'transport.lan.event.received'
    | 'transport.message.ack'
    | 'transport.error'
    | 'host.member.online'
    | 'host.retire'
    | 'host.member.offline'
    | 'host.heartbeat.timeout'
  remote: string
  deviceId?: string
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
  'connection.openTransport': DeviceTransportOpenOptions
  'connection.closeTransport': DeviceTransportCloseOptions
  'connection.sendMessage': DeviceTransportSendMessageOptions
  'connection.sendLanEvent': DeviceTransportSendLanEventOptions
  'connection.getTransportState': DeviceTransportGetStateOptions
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
  'connection.openTransport': DeviceTransportOpenResult
  'connection.closeTransport': DeviceTransportCloseResult
  'connection.sendMessage': DeviceTransportSendMessageResult
  'connection.sendLanEvent': DeviceTransportSendLanEventResult
  'connection.getTransportState': DeviceTransportSnapshot
  'connection.pullHostEvents': DeviceDiscoveryPullHostEventsResult
  'preferences.get': { value: string | null }
  'preferences.set': OperationResult
  'preferences.remove': OperationResult
}
