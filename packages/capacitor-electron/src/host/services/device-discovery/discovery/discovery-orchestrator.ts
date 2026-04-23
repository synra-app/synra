import { randomUUID } from 'node:crypto'
import type {
  DeviceDiscoveryStartOptions,
  DeviceDiscoveryStartResult
} from '../../../../shared/protocol/types'
import {
  DEFAULT_DISCOVERY_TIMEOUT_MS,
  DEFAULT_PROBE_CONCURRENCY,
  DEFAULT_PROBE_TIMEOUT_MS,
  DEFAULT_TCP_PORT
} from '../core/constants'
import { collectLocalIpSet } from '../core/network'
import type { DeviceRegistry } from '../state/device-registry'
import type { DiscoveryStrategy } from './discovery-strategy'
import { probeDevices } from './probe-runner'
import type { ProbeSocketRegistry } from './probe-socket-registry'

type DiscoveryState = 'idle' | 'scanning'

export interface DiscoveryOrchestrator {
  start(options?: DeviceDiscoveryStartOptions): Promise<DeviceDiscoveryStartResult>
  stop(): Promise<{ success: true }>
  list(): Promise<{ state: DiscoveryState }>
}

type DiscoveryOrchestratorOptions = {
  registry: DeviceRegistry
  strategies: DiscoveryStrategy[]
  resolveLocalDeviceUuid: () => string
  probeSocketRegistry?: ProbeSocketRegistry
}

export function createDiscoveryOrchestrator(
  options: DiscoveryOrchestratorOptions
): DiscoveryOrchestrator {
  let state: DiscoveryState = 'idle'
  let localIpSetCache = collectLocalIpSet(false)

  const refreshLocalIpSet = (includeLoopback: boolean) => {
    localIpSetCache = collectLocalIpSet(includeLoopback)
    options.registry.removeByIpSet(localIpSetCache)
  }

  return {
    async start(startOptions = {}) {
      const mode = startOptions.discoveryMode ?? 'hybrid'
      if (startOptions.reset !== false) {
        options.registry.reset()
      }
      state = 'scanning'
      const timeoutMs =
        startOptions.discoveryTimeoutMs && startOptions.discoveryTimeoutMs > 0
          ? startOptions.discoveryTimeoutMs
          : DEFAULT_DISCOVERY_TIMEOUT_MS
      const enableProbeFallback = startOptions.enableProbeFallback !== false
      const shouldUseMdns = mode === 'mdns' || mode === 'hybrid'
      const shouldUseUdp = mode === 'subnet' || (mode === 'hybrid' && enableProbeFallback)
      const shouldUseManual = mode === 'hybrid' || mode === 'manual' || mode === 'subnet'

      const activeKinds = new Set<string>([
        ...(shouldUseMdns ? ['mdns'] : []),
        ...(shouldUseUdp ? ['udp'] : []),
        ...(shouldUseManual ? ['manual'] : [])
      ])
      const activeStrategies = options.strategies.filter((strategy) =>
        activeKinds.has(strategy.kind)
      )
      const discovered = await Promise.all(
        activeStrategies.map((strategy) =>
          strategy.discover({
            options: startOptions,
            timeoutMs,
            localDeviceUuid: options.resolveLocalDeviceUuid()
          })
        )
      )
      options.registry.merge(discovered.flat())

      const probePort = startOptions.port ?? DEFAULT_TCP_PORT
      const probed = await probeDevices(options.registry.list(), {
        localDeviceId: options.resolveLocalDeviceUuid(),
        port: probePort,
        timeoutMs: startOptions.timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS,
        concurrency: startOptions.concurrency ?? DEFAULT_PROBE_CONCURRENCY,
        probeConnectWirePayload: startOptions.probeConnectWirePayload,
        probeSocketRegistry: options.probeSocketRegistry
      })
      options.registry.reset()
      const accepted = probed
        .filter(
          (device) =>
            device.connectable &&
            typeof device.deviceId === 'string' &&
            device.deviceId.trim().length > 0
        )
        .map((device) => {
          const name =
            typeof device.name === 'string' && device.name.trim().length > 0
              ? device.name.trim()
              : device.deviceId
          return { ...device, name }
        })
      options.registry.merge(accepted)
      const keepProbeSockets = new Set(accepted.map((d) => `${d.ipAddress}:${probePort}`))
      options.probeSocketRegistry?.closeStale(keepProbeSockets)

      refreshLocalIpSet(Boolean(startOptions.includeLoopback))
      return {
        requestId: randomUUID(),
        state,
        devices: options.registry.list()
      }
    },
    async stop() {
      state = 'idle'
      return { success: true as const }
    },
    async list() {
      refreshLocalIpSet(false)
      return {
        state
      }
    }
  }
}
