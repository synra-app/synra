import type { PluginListenerHandle } from '@capacitor/core'

export type DiscoverySource = 'mdns' | 'probe' | 'manual'
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

export type ScanStateChangedEvent = {
  state: DiscoveryState
  startedAt?: number
}

export type DeviceConnectableUpdatedEvent = {
  device: DiscoveredDevice
}

export interface LanDiscoveryPlugin {
  startDiscovery(options?: StartDiscoveryOptions): Promise<StartDiscoveryResult>
  stopDiscovery(): Promise<StopDiscoveryResult>
  getDiscoveredDevices(): Promise<ListDiscoveredDevicesResult>
  probeConnectable(options?: ProbeConnectableOptions): Promise<ProbeConnectableResult>
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
    eventName: 'deviceConnectableUpdated',
    listenerFunc: (event: DeviceConnectableUpdatedEvent) => void
  ): Promise<PluginListenerHandle>
}
