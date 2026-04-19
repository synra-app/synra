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
  SessionSnapshot,
  StartDiscoveryOptions,
  StartDiscoveryResult,
  StopDiscoveryResult
} from './definitions'

const DEFAULT_SCAN_WINDOW_MS = 15_000

function now(): number {
  return Date.now()
}

export class LanDiscoveryWeb extends WebPlugin implements LanDiscoveryPlugin {
  private scanState: ListDiscoveredDevicesResult = {
    state: 'idle',
    scanWindowMs: DEFAULT_SCAN_WINDOW_MS,
    devices: []
  }
  private sessionState: SessionSnapshot = {
    state: 'idle'
  }

  async startDiscovery(options: StartDiscoveryOptions = {}): Promise<StartDiscoveryResult> {
    this.scanState = {
      state: 'scanning',
      startedAt: now(),
      scanWindowMs: options.scanWindowMs ?? DEFAULT_SCAN_WINDOW_MS,
      devices: []
    }

    this.notifyListeners('scanStateChanged', {
      state: this.scanState.state,
      startedAt: this.scanState.startedAt
    })

    return {
      requestId: `web-${this.scanState.startedAt ?? now()}`,
      state: this.scanState.state,
      startedAt: this.scanState.startedAt,
      scanWindowMs: this.scanState.scanWindowMs,
      devices: this.scanState.devices
    }
  }

  async stopDiscovery(): Promise<StopDiscoveryResult> {
    this.scanState = {
      ...this.scanState,
      state: 'idle'
    }

    this.notifyListeners('scanStateChanged', {
      state: 'idle',
      startedAt: this.scanState.startedAt
    })

    return { success: true }
  }

  async getDiscoveredDevices(): Promise<ListDiscoveredDevicesResult> {
    return this.scanState
  }

  async pairDevice(options: PairDeviceOptions): Promise<PairDeviceResult> {
    const matched = this.scanState.devices.find((device) => device.deviceId === options.deviceId)
    if (!matched) {
      throw this.unavailable('Device is not available on web fallback.')
    }

    const paired = {
      ...matched,
      paired: true,
      lastSeenAt: now()
    }
    this.scanState = {
      ...this.scanState,
      devices: this.scanState.devices.map((device) =>
        device.deviceId === paired.deviceId ? paired : device
      )
    }
    this.notifyListeners('deviceUpdated', { device: paired })
    return { success: true, device: paired }
  }

  async probeConnectable(options: ProbeConnectableOptions = {}): Promise<ProbeConnectableResult> {
    const checkedAt = now()
    const timeoutMs = options.timeoutMs ?? 1500
    const port = options.port ?? 32100
    this.scanState = {
      ...this.scanState,
      devices: this.scanState.devices.map((device) => ({
        ...device,
        connectable: false,
        connectCheckAt: checkedAt,
        connectCheckError: 'UNSUPPORTED_OPERATION'
      }))
    }
    return {
      checkedAt,
      timeoutMs,
      port,
      devices: this.scanState.devices
    }
  }

  async openSession(_options: OpenSessionOptions): Promise<OpenSessionResult> {
    throw this.unavailable('openSession is not supported on web fallback.')
  }

  async closeSession(_options: CloseSessionOptions = {}): Promise<CloseSessionResult> {
    this.sessionState = {
      ...this.sessionState,
      state: 'closed',
      closedAt: now()
    }
    return { success: true, sessionId: this.sessionState.sessionId }
  }

  async sendMessage(_options: SendMessageOptions): Promise<SendMessageResult> {
    throw this.unavailable('sendMessage is not supported on web fallback.')
  }

  async getSessionState(_options: GetSessionStateOptions = {}): Promise<GetSessionStateResult> {
    return this.sessionState
  }

  async pullHostEvents(): Promise<PullHostEventsResult> {
    return { events: [] }
  }
}
