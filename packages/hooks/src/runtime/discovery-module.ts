import type {
  DiscoveredDevice,
  DiscoveryState,
  ListDiscoveredDevicesResult
} from '@synra/capacitor-lan-discovery'
import type { SynraProbeResult } from '@synra/capacitor-device-connection'
import { SYNRA_PROBE_EMBEDDED_IN_DISCOVERY } from '@synra/capacitor-device-connection'
import { unknownToErrorMessage } from '@synra/protocol'
import type { Ref } from 'vue'
import type { RuntimeConnectedSession, SynraDiscoveryStartOptions } from '../types'
import type { ConnectionRuntimeAdapter } from './adapter'
import { applyHostPairingHintsFromDiscovery } from './apply-host-pairing-hints-from-discovery'
import { getHooksRuntimeOptions, isLocalDiscoveryDeviceId } from './config'
import { sortDevices } from './device-sort'
import { normalizeHost } from './host-normalization'
import { pruneStalePairAwaitingForOpenSessions } from './pair-awaiting-prune'

function defaultSynraPort(options: SynraDiscoveryStartOptions): number {
  return typeof options.port === 'number' && options.port > 0 ? options.port : 32100
}

function mergeDiscoveredWithSynraProbes(
  candidates: DiscoveredDevice[],
  probes: SynraProbeResult[],
  fallbackPort: number
): DiscoveredDevice[] {
  const byHost = new Map<string, SynraProbeResult>()
  for (const probe of probes) {
    byHost.set(normalizeHost(probe.host), probe)
  }
  const now = Date.now()
  const merged: DiscoveredDevice[] = []
  for (const row of candidates) {
    const key = normalizeHost(row.ipAddress)
    const probe = byHost.get(key)
    if (!probe) {
      merged.push(row)
      continue
    }
    if (!probe.ok) {
      if (probe.error === SYNRA_PROBE_EMBEDDED_IN_DISCOVERY) {
        merged.push(row)
      }
      continue
    }
    if (!probe.wireSourceDeviceId) {
      continue
    }
    const display =
      typeof probe.displayName === 'string' && probe.displayName.trim().length > 0
        ? probe.displayName.trim()
        : row.name
    merged.push({
      ...row,
      deviceId: probe.wireSourceDeviceId,
      name: display,
      port: probe.port > 0 ? probe.port : (row.port ?? fallbackPort),
      source: 'probe',
      connectable: true,
      connectCheckAt: now,
      connectCheckError: undefined,
      lastSeenAt: now
    })
  }
  return merged
}

export function createDiscoveryModule(options: {
  adapter: ConnectionRuntimeAdapter
  scanState: Ref<DiscoveryState>
  devices: Ref<DiscoveredDevice[]>
  loading: Ref<boolean>
  error: Ref<string | null>
  connectedSessions: Ref<RuntimeConnectedSession[]>
}): {
  startDiscovery(options?: SynraDiscoveryStartOptions): Promise<void>
  refreshDiscoveredDevicesFromNative(): Promise<ListDiscoveredDevicesResult>
} {
  const { adapter, scanState, devices, loading, error, connectedSessions } = options

  async function refreshDiscoveredDevicesFromNative(): Promise<ListDiscoveredDevicesResult> {
    return adapter.listDiscoveredDevices()
  }

  async function startDiscovery(discoveryOptions: SynraDiscoveryStartOptions = {}): Promise<void> {
    loading.value = true
    try {
      const defaultProbeWire = { connectType: 'fresh' } as Record<string, unknown>
      const result = await adapter.startDiscovery({
        discoveryMode: 'hybrid',
        includeLoopback: false,
        enableProbeFallback: true,
        ...discoveryOptions,
        probeConnectWirePayload: discoveryOptions.probeConnectWirePayload ?? defaultProbeWire
      })
      scanState.value = result.state
      const exclude = getHooksRuntimeOptions().shouldExcludeDiscoveredDevice
      const shouldDrop = (deviceId: string) =>
        isLocalDiscoveryDeviceId(deviceId) || (typeof exclude === 'function' && exclude(deviceId))
      const filtered = result.devices.filter((device) => !shouldDrop(device.deviceId))
      let scanRows = filtered.map((device) => ({
        ...device,
        ipAddress: normalizeHost(device.ipAddress)
      }))

      const fallbackPort = defaultSynraPort(discoveryOptions)
      if (typeof adapter.probeSynraPeers === 'function') {
        const probeWire = discoveryOptions.probeConnectWirePayload ?? defaultProbeWire
        const { results } = await adapter.probeSynraPeers({
          targets: scanRows.map((row) => ({
            host: row.ipAddress,
            port: row.port ?? fallbackPort,
            connectWirePayload: probeWire
          })),
          timeoutMs: discoveryOptions.timeoutMs ?? 1500
        })
        scanRows = mergeDiscoveredWithSynraProbes(scanRows, results, fallbackPort)
        await applyHostPairingHintsFromDiscovery(
          results
            .filter((row) => row.ok && row.wireSourceDeviceId)
            .map((row) => ({
              canonicalDeviceId: row.wireSourceDeviceId ?? '',
              connectAckPayload: row.connectAckPayload
            }))
        )
      }

      devices.value = sortDevices(scanRows)
      pruneStalePairAwaitingForOpenSessions(devices, connectedSessions)
      error.value = null
    } catch (unknownError) {
      error.value = unknownToErrorMessage(unknownError, 'Failed to start discovery.')
    } finally {
      loading.value = false
    }
  }

  return {
    startDiscovery,
    refreshDiscoveredDevicesFromNative
  }
}
