import { WebPlugin } from '@capacitor/core'
import type {
  LanDiscoveryPlugin,
  ListDiscoveredDevicesResult,
  PairDeviceOptions,
  PairDeviceResult,
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

type PairBridgeResult = {
  success: true
  device: PairDeviceResult['device']
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
  'discovery.pair': {
    payload: PairDeviceOptions
    result: PairBridgeResult
  }
  'discovery.probeConnectable': {
    payload: ProbeConnectableOptions
    result: ProbeConnectableBridgeResult
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
      paired: device.paired,
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
    payload: DiscoveryBridgeMethods[TMethod]['payload']
  ): Promise<DiscoveryBridgeMethods[TMethod]['result']> {
    const invoke = this.resolveInvoke()
    return invoke(method, payload) as Promise<DiscoveryBridgeMethods[TMethod]['result']>
  }

  async startDiscovery(options: StartDiscoveryOptions = {}): Promise<StartDiscoveryResult> {
    const result = await this.invokeBridge('discovery.start', options)
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

  async pairDevice(options: PairDeviceOptions): Promise<PairDeviceResult> {
    const result = await this.invokeBridge('discovery.pair', options)
    const mapped = {
      success: result.success,
      device: {
        deviceId: result.device.deviceId,
        name: result.device.name,
        ipAddress: result.device.ipAddress,
        source: result.device.source,
        paired: result.device.paired,
        connectable: result.device.connectable,
        connectCheckAt: result.device.connectCheckAt,
        connectCheckError: result.device.connectCheckError,
        discoveredAt: result.device.discoveredAt,
        lastSeenAt: result.device.lastSeenAt
      }
    } satisfies PairDeviceResult
    this.notifyListeners('deviceUpdated', { device: mapped.device })
    return mapped
  }

  async probeConnectable(options: ProbeConnectableOptions = {}): Promise<ProbeConnectableResult> {
    const result = await this.invokeBridge('discovery.probeConnectable', options)
    for (const device of result.devices) {
      this.notifyListeners('deviceConnectableUpdated', { device })
    }
    return result
  }
}
