import type { PluginListenerHandle } from '@capacitor/core'
import type { SynraMessageType } from '@synra/protocol'

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

export type StartDiscoveryOptions = {
  includeLoopback?: boolean
  manualTargets?: string[]
  enableProbeFallback?: boolean
  discoveryMode?: DiscoveryMode
  mdnsServiceType?: string
  subnetCidrs?: string[]
  maxProbeHosts?: number
  scanWindowMs?: number
  /** @deprecated Not consumed by native implementations. */
  concurrency?: number
  discoveryTimeoutMs?: number
  reset?: boolean
  port?: number
  timeoutMs?: number
}

export type StartDiscoveryResult = {
  requestId: string
  state: DiscoveryState
  scanWindowMs?: number
  startedAt?: number
  devices: DiscoveredDevice[]
}

export type StopDiscoveryResult = {
  success: true
}

export type DiscoveryCloseSessionOptions = {
  sessionId: string
}

export type DiscoveryCloseSessionResult = {
  success: true
  sessionId: string
  transport: 'tcp'
}

export type ListDiscoveredDevicesResult = {
  state: DiscoveryState
  scanWindowMs?: number
  startedAt?: number
  devices: DiscoveredDevice[]
}

export type EnsureOutboundSessionOptions = {
  host: string
  port?: number
  timeoutMs?: number
  /** Optional hint for Electron host bridge (`discovery.openSession`). */
  deviceId?: string
}

export type EnsureOutboundSessionSuccess = {
  sessionId: string
  state: 'idle' | 'connecting' | 'open' | 'closed' | 'error'
  transport: 'tcp'
}

export type EnsureOutboundSessionFailure = {
  error: string
  host?: string
  port?: number
}

export type EnsureOutboundSessionResult =
  | EnsureOutboundSessionSuccess
  | EnsureOutboundSessionFailure

export type DiscoverySendMessageOptions = {
  sessionId: string
  messageType: SynraMessageType
  payload: unknown
  messageId?: string
}

export type DiscoverySendMessageResult = {
  success: true
  sessionId: string
  messageId: string
  transport: 'tcp'
}

export type ScanStateChangedEvent = {
  state: DiscoveryState
}

export type DeviceConnectableUpdatedEvent = {
  device: DiscoveredDevice
}

export type DiscoverySessionOpenedEvent = {
  sessionId: string
  transport: 'tcp'
  deviceId?: string
  direction?: 'inbound' | 'outbound'
  host?: string
  port?: number
  displayName?: string
  pairedPeerDeviceIds?: string[]
  handshakeKind?: 'paired' | 'fresh'
  claimsPeerPaired?: boolean
}

export type DiscoverySessionClosedEvent = {
  sessionId?: string
  transport: 'tcp'
  reason?: string
}

export type DiscoveryMessageReceivedEvent = {
  sessionId: string
  messageId?: string
  messageType: SynraMessageType
  payload: unknown
  timestamp: number
  transport: 'tcp'
}

export type DiscoveryTransportErrorEvent = {
  code?: string
  message?: string
  transport: 'tcp'
}

export interface LanDiscoveryPlugin {
  startDiscovery(options?: StartDiscoveryOptions): Promise<StartDiscoveryResult>
  stopDiscovery(): Promise<StopDiscoveryResult>
  getDiscoveredDevices(): Promise<ListDiscoveredDevicesResult>
  ensureOutboundSession(options: EnsureOutboundSessionOptions): Promise<EnsureOutboundSessionResult>
  closeSession(options: DiscoveryCloseSessionOptions): Promise<DiscoveryCloseSessionResult>
  sendMessage(options: DiscoverySendMessageOptions): Promise<DiscoverySendMessageResult>
  addListener(
    eventName: 'deviceFound',
    listenerFunc: (event: { device: DiscoveredDevice }) => void
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'deviceUpdated',
    listenerFunc: (event: { device: DiscoveredDevice }) => void
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'deviceLost',
    listenerFunc: (event: { deviceId: string; ipAddress?: string }) => void
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'scanStateChanged',
    listenerFunc: (event: ScanStateChangedEvent) => void
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'deviceConnectableUpdated',
    listenerFunc: (event: DeviceConnectableUpdatedEvent) => void
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'sessionOpened',
    listenerFunc: (event: DiscoverySessionOpenedEvent) => void
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'sessionClosed',
    listenerFunc: (event: DiscoverySessionClosedEvent) => void
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'messageReceived',
    listenerFunc: (event: DiscoveryMessageReceivedEvent) => void
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'transportError',
    listenerFunc: (event: DiscoveryTransportErrorEvent) => void
  ): Promise<PluginListenerHandle>
}
