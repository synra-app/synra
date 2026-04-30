import { BRIDGE_PLUGIN_SYNC_TO_DEVICE_TIMEOUT_MS } from '@synra/capacitor-electron/protocol'
import { mergePairedAndDiscoveredDevices, useSynraSystemEnvelope } from '@synra/hooks'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { ensureDeviceInstanceUuid } from '../lib/device-instance-uuid'
import { isIpv4Address } from '../lib/network'
import { tryGetSynraPluginRuntimeBridge } from '../plugins/bridge/synra-plugin-host-bridge'
import { useLanDiscoveryStore } from '../stores/lan-discovery'
import { usePairingStore } from '../stores/pairing'

export type PluginSyncDeviceOutcome =
  | { deviceId: string; outcome: 'skipped_same_version' }
  | { deviceId: string; outcome: 'synced'; transmittedChunks?: number }
  | { deviceId: string; outcome: 'failed'; message: string }

export type PluginSyncToDevicesResult = {
  ok: boolean
  errors: string[]
  skippedSameVersionCount: number
  syncedCount: number
  outcomes: PluginSyncDeviceOutcome[]
}

export function usePluginSync() {
  const synra = useSynraSystemEnvelope()
  const lanStore = useLanDiscoveryStore()
  const pairingStore = usePairingStore()
  const { peers, openTransportLinks } = storeToRefs(lanStore)
  const { pairedRecords } = storeToRefs(pairingStore)

  const readyDeviceIds = computed(
    () =>
      new Set(
        openTransportLinks.value
          .filter(
            (link) =>
              link.transport === 'ready' &&
              typeof link.deviceId === 'string' &&
              link.deviceId.length > 0
          )
          .map((link) => link.deviceId)
      )
  )

  const syncableDisplayDevices = computed(() => {
    const discoveredIpv4 = peers.value.filter((d) => isIpv4Address(d.ipAddress))
    return mergePairedAndDiscoveredDevices(
      pairedRecords.value,
      discoveredIpv4,
      readyDeviceIds.value,
      openTransportLinks.value
    ).filter((d) => readyDeviceIds.value.has(d.deviceId))
  })

  async function queryPeerInstalledPluginVersion(
    deviceId: string,
    pluginId: string
  ): Promise<string | null> {
    const from = await ensureDeviceInstanceUuid()
    const inbound = await synra.request(
      {
        event: 'plugin.installed.query',
        target: deviceId,
        from,
        payload: { pluginId }
      },
      { timeoutMs: 12_000 }
    )
    const p = inbound.envelope.payload as { version?: string | null }
    return p?.version ?? null
  }

  async function syncPluginToDevices(options: {
    pluginId: string
    deviceIds: string[]
    skipVersionPrecheck?: boolean
    onProgress?: (done: number, total: number) => void
  }): Promise<PluginSyncToDevicesResult> {
    const bridge = tryGetSynraPluginRuntimeBridge()
    if (!bridge) {
      return {
        ok: false,
        errors: ['Plugin host is unavailable on this runtime.'],
        skippedSameVersionCount: 0,
        syncedCount: 0,
        outcomes: []
      }
    }
    const localList = await bridge.listInstalledPlugins()
    const local = localList.plugins.find((p) => p.pluginId === options.pluginId)
    if (!local) {
      return {
        ok: false,
        errors: ['Plugin is not installed locally.'],
        skippedSameVersionCount: 0,
        syncedCount: 0,
        outcomes: []
      }
    }

    const outcomes: PluginSyncDeviceOutcome[] = []
    const total = options.deviceIds.length
    let done = 0
    const errors: string[] = []
    let skippedSameVersionCount = 0
    let syncedCount = 0

    for (const deviceId of options.deviceIds) {
      try {
        if (!readyDeviceIds.value.has(deviceId)) {
          const message = `${deviceId}: transport is not ready`
          errors.push(message)
          outcomes.push({ deviceId, outcome: 'failed', message })
          done += 1
          options.onProgress?.(done, total)
          continue
        }
        if (!options.skipVersionPrecheck) {
          const remote = await queryPeerInstalledPluginVersion(deviceId, options.pluginId)
          if (remote === local.version) {
            skippedSameVersionCount += 1
            outcomes.push({ deviceId, outcome: 'skipped_same_version' })
            done += 1
            options.onProgress?.(done, total)
            continue
          }
        }

        await lanStore.connectToDevice(deviceId).catch(() => undefined)

        const r = await bridge.syncPluginToDevice(
          { deviceId, pluginId: options.pluginId },
          { timeoutMs: BRIDGE_PLUGIN_SYNC_TO_DEVICE_TIMEOUT_MS }
        )
        if (!r.success) {
          const message = `${deviceId}: ${r.reason}`
          errors.push(message)
          outcomes.push({ deviceId, outcome: 'failed', message })
        } else {
          syncedCount += 1
          outcomes.push({
            deviceId,
            outcome: 'synced',
            transmittedChunks: r.transmittedChunks
          })
        }
      } catch (e) {
        const message = `${deviceId}: ${e instanceof Error ? e.message : String(e)}`
        errors.push(message)
        outcomes.push({ deviceId, outcome: 'failed', message })
      }
      done += 1
      options.onProgress?.(done, total)
    }
    return {
      ok: errors.length === 0,
      errors,
      skippedSameVersionCount,
      syncedCount,
      outcomes
    }
  }

  return {
    syncableDisplayDevices,
    readyDeviceIds,
    queryPeerInstalledPluginVersion,
    syncPluginToDevices
  }
}
