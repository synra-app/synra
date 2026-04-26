import { WebPlugin, type ListenerCallback, type PluginListenerHandle } from '@capacitor/core'
import type {
  LanDiscoveryPlugin,
  ListDiscoveredDevicesResult,
  StartDiscoveryOptions,
  StartDiscoveryResult,
  StopDiscoveryResult
} from './definitions'
import { discoveredDeviceFromHostEvent, lostDeviceFromHostEvent } from './host-event-device'

type ElectronBridgeTarget = {
  __synraCapElectron?: {
    invoke?: BridgeInvoke
    onHostEvent?: (
      listener: (event: { type: string; remote?: string; payload?: unknown }) => void
    ) => () => void
  }
}

type BridgeInvoke = (
  method: string,
  payload: unknown,
  options?: { timeoutMs?: number; signal?: AbortSignal }
) => Promise<unknown>

const DISCOVERY_START_TIMEOUT_MS = 30_000

type DiscoveryStartBridgeResult = {
  requestId: string
  state: 'idle' | 'scanning'
  devices: ListDiscoveredDevicesResult['devices']
}

type DiscoveryListBridgeResult = {
  state: 'idle' | 'scanning'
  devices: ListDiscoveredDevicesResult['devices']
}

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
}

function toListResult(result: DiscoveryListBridgeResult) {
  return {
    state: result.state,
    devices: result.devices.map((device) => ({
      deviceId: device.deviceId,
      name: device.name,
      ipAddress: device.ipAddress,
      port: device.port,
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
  private hostEventSubscribed = false

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

  private ensureHostEventSubscription(): void {
    if (this.hostEventSubscribed) {
      return
    }
    const target = globalThis as unknown as ElectronBridgeTarget
    const subscribe = target.__synraCapElectron?.onHostEvent
    if (!subscribe) {
      return
    }
    subscribe((event) => {
      const device = discoveredDeviceFromHostEvent(event)
      if (device) {
        this.notifyListeners('deviceFound', { device })
        this.notifyListeners('deviceUpdated', { device })
        this.notifyListeners('deviceConnectableUpdated', { device })
      }
      const lost = lostDeviceFromHostEvent(event)
      if (lost) {
        this.notifyListeners('deviceLost', {
          deviceId: lost.deviceId,
          ipAddress: lost.ipAddress
        })
      }
    })
    this.hostEventSubscribed = true
  }

  async startDiscovery(options: StartDiscoveryOptions = {}): Promise<StartDiscoveryResult> {
    this.ensureHostEventSubscription()
    const result = await this.invokeBridge('discovery.start', options, {
      timeoutMs: DISCOVERY_START_TIMEOUT_MS
    })
    const listResult = toListResult(result)
    this.notifyListeners('scanStateChanged', {
      state: listResult.state
    })
    for (const device of listResult.devices) {
      this.notifyListeners('deviceFound', { device })
    }

    return {
      requestId: result.requestId,
      state: listResult.state,
      devices: listResult.devices
    }
  }

  async stopDiscovery(): Promise<StopDiscoveryResult> {
    this.ensureHostEventSubscription()
    const result = await this.invokeBridge('discovery.stop', {})
    this.notifyListeners('scanStateChanged', { state: 'idle' })
    return result
  }

  async getDiscoveredDevices(): Promise<ListDiscoveredDevicesResult> {
    this.ensureHostEventSubscription()
    const result = await this.invokeBridge('discovery.list', {})
    return toListResult(result)
  }

  addListener(
    eventName: 'deviceFound',
    listenerFunc: (event: { device: ListDiscoveredDevicesResult['devices'][number] }) => void
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'deviceUpdated',
    listenerFunc: (event: { device: ListDiscoveredDevicesResult['devices'][number] }) => void
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'deviceLost',
    listenerFunc: (event: { deviceId: string; ipAddress?: string }) => void
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'scanStateChanged',
    listenerFunc: (event: { state: 'idle' | 'scanning' }) => void
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'deviceConnectableUpdated',
    listenerFunc: (event: { device: ListDiscoveredDevicesResult['devices'][number] }) => void
  ): Promise<PluginListenerHandle>
  addListener(eventName: string, listenerFunc: ListenerCallback): Promise<PluginListenerHandle> {
    this.ensureHostEventSubscription()
    return super.addListener(eventName, listenerFunc)
  }
}
