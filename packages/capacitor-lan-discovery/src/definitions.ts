/** LanDiscovery is discovery-only (mDNS/UDP/list). No Synra TCP transport or pairing semantics in this API surface. */
import type { PluginListenerHandle } from '@capacitor/core'

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
  /** Electron host: merged into each Synra TCP probe `connect` payload for this run. */
  probeConnectWirePayload?: Record<string, unknown>
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

export type ListDiscoveredDevicesResult = {
  state: DiscoveryState
  scanWindowMs?: number
  startedAt?: number
  devices: DiscoveredDevice[]
}

export type ScanStateChangedEvent = {
  state: DiscoveryState
}

export type DeviceConnectableUpdatedEvent = {
  device: DiscoveredDevice
}

export interface LanDiscoveryPlugin {
  startDiscovery(options?: StartDiscoveryOptions): Promise<StartDiscoveryResult>
  stopDiscovery(): Promise<StopDiscoveryResult>
  getDiscoveredDevices(): Promise<ListDiscoveredDevicesResult>
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
}
