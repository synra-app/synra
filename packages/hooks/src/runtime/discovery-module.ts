import type {
  DiscoveredDevice,
  DiscoveryState,
  ListDiscoveredDevicesResult
} from '@synra/capacitor-lan-discovery'
import type { SynraProbeResult } from '@synra/capacitor-device-connection'
import { SYNRA_PROBE_EMBEDDED_IN_DISCOVERY } from '@synra/capacitor-device-connection'
import { unknownToErrorMessage } from '@synra/protocol'
import type { Ref } from 'vue'
import type { RuntimeOpenTransportLink, SynraDiscoveryStartOptions } from '../types'
import type { ConnectionRuntimeAdapter } from './adapter'
import { applyHostPairingHintsFromDiscovery } from './apply-host-pairing-hints-from-discovery'
import {
  filterAdmittedDiscoveredDevices,
  shouldKeepDiscoveredDeviceId
} from './discovery-admission'
import { shouldExposeDiscoveredDevice } from './discovery-exposure'
import { sortDevices } from './device-sort'
import { normalizeHost } from './host-normalization'
import {
  hasReadyOpenLinkForScanRow,
  mergeReadyLinksIntoDiscovered
} from './merge-ready-links-into-discovered'
import { pruneStalePairAwaitingForOpenTransportLinks } from './pair-awaiting-prune'

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
      continue
    }
    if (!probe.ok) {
      if (probe.error === SYNRA_PROBE_EMBEDDED_IN_DISCOVERY && shouldExposeDiscoveredDevice(row)) {
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
  openTransportLinks: Ref<RuntimeOpenTransportLink[]>
}): {
  startDiscovery(options?: SynraDiscoveryStartOptions): Promise<void>
  refreshDiscoveredDevicesFromNative(): Promise<ListDiscoveredDevicesResult>
} {
  const { adapter, scanState, devices, loading, error, openTransportLinks } = options

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
      const filtered = result.devices.filter((device) =>
        shouldKeepDiscoveredDeviceId(device.deviceId)
      )
      let scanRows = filtered.map((device) => ({
        ...device,
        ipAddress: normalizeHost(device.ipAddress)
      }))

      const fallbackPort = defaultSynraPort(discoveryOptions)
      const liveLinks = openTransportLinks.value
      if (typeof adapter.probeSynraPeers === 'function' && scanRows.length > 0) {
        const preProbeRows = scanRows
        const probeWire = discoveryOptions.probeConnectWirePayload ?? defaultProbeWire
        const probeable = preProbeRows.filter(
          (row) => !hasReadyOpenLinkForScanRow(row, liveLinks, fallbackPort)
        )
        if (probeable.length > 0) {
          const targets = probeable.map((row) => ({
            host: row.ipAddress,
            port: row.port ?? fallbackPort,
            connectWirePayload: probeWire
          }))
          try {
            const { results } = await adapter.probeSynraPeers({
              targets,
              timeoutMs: discoveryOptions.timeoutMs ?? 1500
            })
            scanRows = mergeDiscoveredWithSynraProbes(probeable, results, fallbackPort)
            await applyHostPairingHintsFromDiscovery(
              results
                .filter((row) => row.ok && row.wireSourceDeviceId)
                .map((row) => ({
                  canonicalDeviceId: row.wireSourceDeviceId ?? '',
                  connectAckPayload: row.connectAckPayload
                }))
            )
          } catch {
            // Restore LAN candidates when the whole probe call fails; single-target failures
            // are represented per-result in mergeDiscoveredWithSynraProbes.
            scanRows = preProbeRows
          }
        } else {
          scanRows = []
        }
      }
      scanRows = mergeReadyLinksIntoDiscovered(scanRows, liveLinks, fallbackPort)
      scanRows = filterAdmittedDiscoveredDevices(scanRows)

      devices.value = sortDevices(scanRows)
      pruneStalePairAwaitingForOpenTransportLinks(devices, openTransportLinks)
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
