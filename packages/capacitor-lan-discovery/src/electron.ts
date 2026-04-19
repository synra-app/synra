import { WebPlugin } from '@capacitor/core'
import type {
  CloseSessionOptions,
  CloseSessionResult,
  GetSessionStateOptions,
  GetSessionStateResult,
  LanDiscoveryPlugin,
  ListDiscoveredDevicesResult,
  OpenSessionOptions,
  OpenSessionResult,
  PairDeviceOptions,
  PairDeviceResult,
  PullHostEventsResult,
  ProbeConnectableOptions,
  ProbeConnectableResult,
  SendMessageOptions,
  SendMessageResult,
  StartDiscoveryOptions,
  StartDiscoveryResult,
  StopDiscoveryResult
} from './definitions'

type ElectronBridgeTarget = {
  __synraCapElectron?: {
    invoke?: BridgeInvoke
    onHostEvent?: (listener: (event: PullHostEventsResult['events'][number]) => void) => () => void
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
type OpenSessionBridgeResult = OpenSessionResult
type CloseSessionBridgeResult = CloseSessionResult
type SendMessageBridgeResult = SendMessageResult
type GetSessionStateBridgeResult = GetSessionStateResult
type PullHostEventsBridgeResult = PullHostEventsResult

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
  'discovery.openSession': {
    payload: OpenSessionOptions
    result: OpenSessionBridgeResult
  }
  'discovery.closeSession': {
    payload: CloseSessionOptions
    result: CloseSessionBridgeResult
  }
  'discovery.sendMessage': {
    payload: SendMessageOptions
    result: SendMessageBridgeResult
  }
  'discovery.getSessionState': {
    payload: GetSessionStateOptions
    result: GetSessionStateBridgeResult
  }
  'discovery.pullHostEvents': {
    payload: Record<string, never>
    result: PullHostEventsBridgeResult
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
      this.notifyListeners('hostEvent', event)
      if (event.type === 'transport.message.received' && event.sessionId) {
        this.notifyListeners('messageReceived', {
          sessionId: event.sessionId,
          messageId: event.messageId,
          messageType: event.messageType ?? 'transport.message.received',
          payload: event.payload ?? null,
          timestamp: event.timestamp
        })
      } else if (event.type === 'transport.message.ack' && event.sessionId && event.messageId) {
        this.notifyListeners('messageAck', {
          sessionId: event.sessionId,
          messageId: event.messageId,
          timestamp: event.timestamp
        })
      } else if (event.type === 'transport.session.opened' && event.sessionId) {
        this.notifyListeners('sessionOpened', {
          sessionId: event.sessionId
        })
      } else if (event.type === 'transport.session.closed') {
        this.notifyListeners('sessionClosed', {
          sessionId: event.sessionId,
          reason: 'peer-closed'
        })
      } else if (event.type === 'transport.error') {
        const message =
          typeof event.payload === 'string'
            ? event.payload
            : event.payload && typeof event.payload === 'object' && 'message' in event.payload
              ? JSON.stringify(
                  (event.payload as { message?: unknown }).message ?? 'Transport error'
                )
              : 'Transport error'
        this.notifyListeners('transportError', {
          sessionId: event.sessionId,
          code: event.code,
          message
        })
      }
    })
    this.hostEventSubscribed = true
  }

  private async invokeBridge<TMethod extends keyof DiscoveryBridgeMethods>(
    method: TMethod,
    payload: DiscoveryBridgeMethods[TMethod]['payload']
  ): Promise<DiscoveryBridgeMethods[TMethod]['result']> {
    const invoke = this.resolveInvoke()
    return invoke(method, payload) as Promise<DiscoveryBridgeMethods[TMethod]['result']>
  }

  async startDiscovery(options: StartDiscoveryOptions = {}): Promise<StartDiscoveryResult> {
    this.ensureHostEventSubscription()
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

  async pairDevice(options: PairDeviceOptions): Promise<PairDeviceResult> {
    this.ensureHostEventSubscription()
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
    this.ensureHostEventSubscription()
    const result = await this.invokeBridge('discovery.probeConnectable', options)
    for (const device of result.devices) {
      this.notifyListeners('deviceConnectableUpdated', { device })
    }
    return result
  }

  async openSession(options: OpenSessionOptions): Promise<OpenSessionResult> {
    this.ensureHostEventSubscription()
    const result = await this.invokeBridge('discovery.openSession', options)
    this.notifyListeners('sessionOpened', {
      sessionId: result.sessionId,
      deviceId: options.deviceId,
      host: options.host,
      port: options.port
    })
    return result
  }

  async closeSession(options: CloseSessionOptions = {}): Promise<CloseSessionResult> {
    this.ensureHostEventSubscription()
    const result = await this.invokeBridge('discovery.closeSession', options)
    this.notifyListeners('sessionClosed', {
      sessionId: result.sessionId,
      reason: 'closed-by-client'
    })
    return result
  }

  async sendMessage(options: SendMessageOptions): Promise<SendMessageResult> {
    this.ensureHostEventSubscription()
    const result = await this.invokeBridge('discovery.sendMessage', options)
    return result
  }

  async getSessionState(options: GetSessionStateOptions = {}): Promise<GetSessionStateResult> {
    this.ensureHostEventSubscription()
    return this.invokeBridge('discovery.getSessionState', options)
  }

  async pullHostEvents(): Promise<PullHostEventsResult> {
    this.ensureHostEventSubscription()
    return this.invokeBridge('discovery.pullHostEvents', {})
  }
}
