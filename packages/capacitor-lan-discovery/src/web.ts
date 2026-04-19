import { WebPlugin } from '@capacitor/core'
import type {
  LanDiscoveryPlugin,
  ListDiscoveredDevicesResult,
  ProbeConnectableOptions,
  ProbeConnectableResult,
  StartDiscoveryOptions,
  StartDiscoveryResult,
  StopDiscoveryResult
} from './definitions'

const DEFAULT_SCAN_WINDOW_MS = 15_000

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
  private scanState: ListDiscoveredDevicesResult = {
    state: 'idle',
    scanWindowMs: DEFAULT_SCAN_WINDOW_MS,
    devices: []
  }

  async startDiscovery(options: StartDiscoveryOptions = {}): Promise<StartDiscoveryResult> {
    const manualDevices = toManualWebDevices(options.manualTargets ?? [])
    this.scanState = {
      state: 'scanning',
      startedAt: now(),
      scanWindowMs: options.scanWindowMs ?? DEFAULT_SCAN_WINDOW_MS,
      devices: manualDevices
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
}
