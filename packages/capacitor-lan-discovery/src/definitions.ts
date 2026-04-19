import type { PluginListenerHandle } from '@capacitor/core'
import type { SynraMessageType } from '@synra/protocol'

export type DiscoverySource = 'mdns' | 'probe' | 'manual'
export type DiscoveryMode = 'hybrid' | 'mdns' | 'subnet' | 'manual'

export type DiscoveryState = 'idle' | 'scanning'

export type DiscoveredDevice = {
  deviceId: string
  name: string
  ipAddress: string
  source: DiscoverySource
  paired: boolean
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
  concurrency?: number
  discoveryTimeoutMs?: number
  reset?: boolean
  scanWindowMs?: number
  port?: number
  timeoutMs?: number
}

export type StartDiscoveryResult = {
  requestId: string
  state: DiscoveryState
  startedAt?: number
  scanWindowMs: number
  devices: DiscoveredDevice[]
}

export type StopDiscoveryResult = {
  success: true
}

export type ListDiscoveredDevicesResult = {
  state: DiscoveryState
  startedAt?: number
  scanWindowMs: number
  devices: DiscoveredDevice[]
}

export type PairDeviceOptions = {
  deviceId: string
}

export type PairDeviceResult = {
  success: true
  device: DiscoveredDevice
}

export type ProbeConnectableOptions = {
  port?: number
  timeoutMs?: number
}

export type ProbeConnectableResult = {
  checkedAt: number
  port: number
  timeoutMs: number
  devices: DiscoveredDevice[]
}

export type OpenSessionOptions = {
  deviceId: string
  host: string
  port: number
  token?: string
}

export type SessionState = 'idle' | 'connecting' | 'open' | 'closed' | 'error'

export type SessionSnapshot = {
  sessionId?: string
  deviceId?: string
  host?: string
  port?: number
  state: SessionState
  lastError?: string
  openedAt?: number
  closedAt?: number
}

export type OpenSessionResult = {
  success: true
  sessionId: string
  state: SessionState
}

export type CloseSessionOptions = {
  sessionId?: string
}

export type CloseSessionResult = {
  success: true
  sessionId?: string
}

export type SendMessageOptions = {
  sessionId: string
  messageType: SynraMessageType
  payload: unknown
  messageId?: string
}

export type SendMessageResult = {
  success: true
  messageId: string
  sessionId: string
}

export type GetSessionStateOptions = {
  sessionId?: string
}

export type GetSessionStateResult = SessionSnapshot

export type HostEvent = {
  id: number
  timestamp: number
  type:
    | 'transport.session.opened'
    | 'transport.session.closed'
    | 'transport.message.received'
    | 'transport.message.ack'
    | 'transport.error'
  remote: string
  sessionId?: string
  messageId?: string
  messageType?: SynraMessageType
  code?: string
  payload?: unknown
}

export type PullHostEventsResult = {
  events: HostEvent[]
}

export type ScanStateChangedEvent = {
  state: DiscoveryState
  startedAt?: number
}

export type SessionOpenedEvent = {
  sessionId: string
  deviceId?: string
  host?: string
  port?: number
}

export type SessionClosedEvent = {
  sessionId?: string
  reason?: string
}

export type MessageReceivedEvent = {
  sessionId: string
  messageId?: string
  messageType: SynraMessageType
  payload: unknown
  timestamp: number
}

export type MessageAckEvent = {
  sessionId: string
  messageId: string
  timestamp: number
}

export type TransportErrorEvent = {
  sessionId?: string
  code?: string
  message: string
}

export type DeviceConnectableUpdatedEvent = {
  device: DiscoveredDevice
}

export interface LanDiscoveryPlugin {
  startDiscovery(options?: StartDiscoveryOptions): Promise<StartDiscoveryResult>
  stopDiscovery(): Promise<StopDiscoveryResult>
  getDiscoveredDevices(): Promise<ListDiscoveredDevicesResult>
  pairDevice(options: PairDeviceOptions): Promise<PairDeviceResult>
  probeConnectable(options?: ProbeConnectableOptions): Promise<ProbeConnectableResult>
  openSession(options: OpenSessionOptions): Promise<OpenSessionResult>
  closeSession(options?: CloseSessionOptions): Promise<CloseSessionResult>
  sendMessage(options: SendMessageOptions): Promise<SendMessageResult>
  getSessionState(options?: GetSessionStateOptions): Promise<GetSessionStateResult>
  pullHostEvents(): Promise<PullHostEventsResult>
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
    listenerFunc: (event: { deviceId: string }) => void
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'scanStateChanged',
    listenerFunc: (event: ScanStateChangedEvent) => void
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'sessionOpened',
    listenerFunc: (event: SessionOpenedEvent) => void
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'sessionClosed',
    listenerFunc: (event: SessionClosedEvent) => void
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'messageReceived',
    listenerFunc: (event: MessageReceivedEvent) => void
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'messageAck',
    listenerFunc: (event: MessageAckEvent) => void
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'transportError',
    listenerFunc: (event: TransportErrorEvent) => void
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'deviceConnectableUpdated',
    listenerFunc: (event: DeviceConnectableUpdatedEvent) => void
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'hostEvent',
    listenerFunc: (event: HostEvent) => void
  ): Promise<PluginListenerHandle>
}
