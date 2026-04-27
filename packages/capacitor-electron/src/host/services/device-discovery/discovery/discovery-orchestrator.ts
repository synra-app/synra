import { randomUUID } from 'node:crypto'
import { DEFAULT_SYNRA_SCAN_BUDGET_MS, synraDiscoveryTimeoutsFromBudget } from '@synra/protocol'
import type {
  DeviceDiscoveryStartOptions,
  DeviceDiscoveryStartResult,
  DiscoveredDevice
} from '../../../../shared/protocol/types'
import { DEFAULT_PROBE_CONCURRENCY, DEFAULT_TCP_PORT } from '../core/constants'
import { collectLocalIpSet } from '../core/network'
import type { DeviceRegistry } from '../state/device-registry'
import type { DiscoveryStrategy } from './discovery-strategy'
import { isUuidLike, probeDevices } from './probe-runner'
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

function canTrustLanIdentityWithoutTcp(device: DiscoveredDevice): boolean {
  if (!isUuidLike(device.deviceId)) {
    return false
  }
  if (device.source === 'manual') {
    return false
  }
  return device.source === 'mdns' || device.source === 'probe'
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
      const budget =
        startOptions.scanBudgetMs && startOptions.scanBudgetMs > 0
          ? startOptions.scanBudgetMs
          : DEFAULT_SYNRA_SCAN_BUDGET_MS
      const { discoveryTimeoutMs, probeTimeoutMs } = synraDiscoveryTimeoutsFromBudget(budget)
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
      const discoveredByStrategy = await Promise.all(
        activeStrategies.map(async (strategy) => {
          const rows = await strategy.discover({
            options: startOptions,
            timeoutMs: discoveryTimeoutMs,
            localDeviceUuid: options.resolveLocalDeviceUuid()
          })
          return { strategy: strategy.kind, rows }
        })
      )
      const discovered = discoveredByStrategy.map((row) => row.rows)
      options.registry.merge(discovered.flat())

      const probePort = startOptions.port ?? DEFAULT_TCP_PORT
      const probeInputs = options.registry.list()
      const tcpProbeTargets = probeInputs.filter((d) => !canTrustLanIdentityWithoutTcp(d))
      const trustedLan = probeInputs.filter(canTrustLanIdentityWithoutTcp)
      const probed = await probeDevices(tcpProbeTargets, {
        localDeviceId: options.resolveLocalDeviceUuid(),
        port: probePort,
        timeoutMs: probeTimeoutMs,
        concurrency: startOptions.concurrency ?? DEFAULT_PROBE_CONCURRENCY,
        probeConnectWirePayload: startOptions.probeConnectWirePayload,
        probeSocketRegistry: options.probeSocketRegistry
      })
      const now = Date.now()
      const trustedAccepted: DiscoveredDevice[] = trustedLan.map((device) => {
        const name =
          typeof device.name === 'string' && device.name.trim().length > 0
            ? device.name.trim()
            : device.ipAddress
        return {
          ...device,
          name,
          port: device.port ?? probePort,
          source: 'probe' as const,
          connectable: true,
          connectCheckAt: now,
          connectCheckError: undefined,
          lastSeenAt: now
        }
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
          return { ...device, name, source: 'probe' as const }
        })
      options.registry.merge([...accepted, ...trustedAccepted])
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
