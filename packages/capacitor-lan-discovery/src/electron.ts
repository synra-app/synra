import { WebPlugin } from '@capacitor/core'
import type {
  DiscoveryCloseSessionOptions,
  DiscoveryCloseSessionResult,
  DiscoverySendMessageOptions,
  DiscoverySendMessageResult,
  LanDiscoveryPlugin,
  ListDiscoveredDevicesResult,
  ProbeConnectableOptions,
  ProbeConnectableResult,
  StartDiscoveryOptions,
  StartDiscoveryResult,
  StopDiscoveryResult
} from './definitions'

type ElectronBridgeTarget = {
  __synraCapElectron?: {
    invoke?: BridgeInvoke
  }
}

type BridgeInvoke = (
  method: string,
  payload: unknown,
  options?: { timeoutMs?: number; signal?: AbortSignal }
) => Promise<unknown>

const DISCOVERY_START_TIMEOUT_MS = 30_000
const DISCOVERY_PROBE_TIMEOUT_MS = 20_000

type DiscoveryStartBridgeResult = {
  requestId: string
  state: 'idle' | 'scanning'
  startedAt?: number
  scanWindowMs: number
  devices: ListDiscoveredDevicesResult['devices']
}

type DiscoveryListBridgeResult = {
  state: 'idle' | 'scanning'
  startedAt?: number
  scanWindowMs: number
  devices: ListDiscoveredDevicesResult['devices']
}

type ProbeConnectableBridgeResult = ProbeConnectableResult

type DiscoveryBridgeMethods = {
  'discovery.start': {
    payload: StartDiscoveryOptions
    result: DiscoveryStartBridgeResult
  }
  'discovery.stop': {
    payload: Record<string, never>
    result: StopDiscoveryResult
  }
  'discovery.list': {
    payload: Record<string, never>
    result: DiscoveryListBridgeResult
  }
  'discovery.probeConnectable': {
    payload: ProbeConnectableOptions
    result: ProbeConnectableBridgeResult
  }
  'discovery.closeSession': {
    payload: DiscoveryCloseSessionOptions
    result: DiscoveryCloseSessionResult
  }
  'discovery.sendMessage': {
    payload: DiscoverySendMessageOptions
    result: DiscoverySendMessageResult
  }
}

function toListResult(result: DiscoveryListBridgeResult) {
  return {
    state: result.state,
    startedAt: result.startedAt,
    scanWindowMs: result.scanWindowMs,
    devices: result.devices.map((device) => ({
      deviceId: device.deviceId,
      name: device.name,
      ipAddress: device.ipAddress,
      source: device.source,
      connectable: device.connectable,
      connectCheckAt: device.connectCheckAt,
      connectCheckError: device.connectCheckError,
      discoveredAt: device.discoveredAt,
      lastSeenAt: device.lastSeenAt
    }))
  } satisfies ListDiscoveredDevicesResult
}

export class LanDiscoveryElectron extends WebPlugin implements LanDiscoveryPlugin {
  private invoke: BridgeInvoke | undefined

  private resolveInvoke(): BridgeInvoke {
    if (this.invoke) {
      return this.invoke
    }

    const target = globalThis as unknown as ElectronBridgeTarget
    const invoke = target.__synraCapElectron?.invoke

    if (!invoke) {
      throw this.unavailable('Electron bridge is unavailable.')
    }

    this.invoke = invoke
    return invoke
  }

  private async invokeBridge<TMethod extends keyof DiscoveryBridgeMethods>(
    method: TMethod,
    payload: DiscoveryBridgeMethods[TMethod]['payload'],
    options?: { timeoutMs?: number; signal?: AbortSignal }
  ): Promise<DiscoveryBridgeMethods[TMethod]['result']> {
    const invoke = this.resolveInvoke()
    return invoke(method, payload, options) as Promise<DiscoveryBridgeMethods[TMethod]['result']>
  }

  async startDiscovery(options: StartDiscoveryOptions = {}): Promise<StartDiscoveryResult> {
    const result = await this.invokeBridge('discovery.start', options, {
      timeoutMs: DISCOVERY_START_TIMEOUT_MS
    })
    const listResult = toListResult(result)
    this.notifyListeners('scanStateChanged', {
      state: listResult.state,
      startedAt: listResult.startedAt
    })
    for (const device of listResult.devices) {
      this.notifyListeners('deviceFound', { device })
    }

    return {
      requestId: result.requestId,
      state: listResult.state,
      startedAt: listResult.startedAt,
      scanWindowMs: listResult.scanWindowMs,
      devices: listResult.devices
    }
  }

  async stopDiscovery(): Promise<StopDiscoveryResult> {
    const result = await this.invokeBridge('discovery.stop', {})
    this.notifyListeners('scanStateChanged', { state: 'idle' })
    return result
  }

  async getDiscoveredDevices(): Promise<ListDiscoveredDevicesResult> {
    const result = await this.invokeBridge('discovery.list', {})
    return toListResult(result)
  }

  async probeConnectable(options: ProbeConnectableOptions = {}): Promise<ProbeConnectableResult> {
    const result = await this.invokeBridge('discovery.probeConnectable', options, {
      timeoutMs: DISCOVERY_PROBE_TIMEOUT_MS
    })
    for (const device of result.devices) {
      this.notifyListeners('deviceConnectableUpdated', { device })
    }
    return result
  }

  async closeSession(options: DiscoveryCloseSessionOptions): Promise<DiscoveryCloseSessionResult> {
    return this.invokeBridge('discovery.closeSession', options)
  }

  async sendMessage(options: DiscoverySendMessageOptions): Promise<DiscoverySendMessageResult> {
    return this.invokeBridge('discovery.sendMessage', options)
  }
}
