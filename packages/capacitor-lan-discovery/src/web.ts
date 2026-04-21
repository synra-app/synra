import { WebPlugin } from '@capacitor/core'
import type {
  DiscoveryCloseSessionOptions,
  DiscoveryCloseSessionResult,
  DiscoverySendMessageOptions,
  DiscoverySendMessageResult,
  LanDiscoveryPlugin,
  ListDiscoveredDevicesResult,
  StartDiscoveryOptions,
  StartDiscoveryResult,
  StopDiscoveryResult
} from './definitions'

const DEFAULT_SCAN_WINDOW_MS = 15_000

type WebScanState = {
  state: ListDiscoveredDevicesResult['state']
  startedAt?: number
  scanWindowMs: number
  devices: ListDiscoveredDevicesResult['devices']
}

function now(): number {
  return Date.now()
}

function toManualWebDevices(manualTargets: string[]) {
  return manualTargets
    .map((target) => target.trim())
    .filter((target) => target.length > 0)
    .map((target, index) => ({
      deviceId: `web-manual-${index + 1}-${target}`,
      name: `Manual Target ${index + 1}`,
      ipAddress: target,
      source: 'manual' as const,
      connectable: false,
      connectCheckAt: now(),
      connectCheckError: 'CAPABILITY_UNAVAILABLE_ON_WEB',
      discoveredAt: now(),
      lastSeenAt: now()
    }))
}

export class LanDiscoveryWeb extends WebPlugin implements LanDiscoveryPlugin {
  private scanState: WebScanState = {
    state: 'idle',
    scanWindowMs: DEFAULT_SCAN_WINDOW_MS,
    devices: []
  }

  async startDiscovery(options: StartDiscoveryOptions = {}): Promise<StartDiscoveryResult> {
    const manualDevices = toManualWebDevices(options.manualTargets ?? [])
    this.scanState = {
      state: 'scanning',
      startedAt: now(),
      scanWindowMs: DEFAULT_SCAN_WINDOW_MS,
      devices: manualDevices
    }

    this.notifyListeners('scanStateChanged', {
      state: this.scanState.state
    })

    return {
      requestId: `web-${this.scanState.startedAt ?? now()}`,
      state: this.scanState.state,
      devices: this.scanState.devices
    }
  }

  async stopDiscovery(): Promise<StopDiscoveryResult> {
    this.scanState = {
      ...this.scanState,
      state: 'idle'
    }

    this.notifyListeners('scanStateChanged', {
      state: 'idle'
    })

    return { success: true }
  }

  async getDiscoveredDevices(): Promise<ListDiscoveredDevicesResult> {
    return {
      state: this.scanState.state,
      devices: this.scanState.devices
    }
  }

  async closeSession(_options: DiscoveryCloseSessionOptions): Promise<DiscoveryCloseSessionResult> {
    throw this.unavailable('closeSession is unavailable on web runtime.')
  }

  async sendMessage(_options: DiscoverySendMessageOptions): Promise<DiscoverySendMessageResult> {
    throw this.unavailable('sendMessage is unavailable on web runtime.')
  }
}
