import type { DiscoveredDevice } from '@synra/capacitor-lan-discovery'
import { computed } from 'vue'
import type { RuntimeOpenTransportInput } from '../types'
import { getConnectionRuntime } from '../runtime/core'
import { normalizeHost } from '../runtime/host-normalization'
import { findReadyTransportLinkForDevice } from '../runtime/ready-transport-link'

export type ConnectToDeviceOptions = Pick<RuntimeOpenTransportInput, 'suppressGlobalError'>

function isTransportLive(link: { transport: string }): boolean {
  return link.transport === 'ready' || link.transport === 'handshaking'
}

/**
 * Discovery + connection orchestration (`startScan`, `connectToDevice`). Host apps use this for the
 * device screen. Send/receive app messages via `useSynraEvent` / `useSynraPluginEvent` (or `useSynraEnvelope`
 * for raw wire names). Plugins must not call discovery APIs; use `usePairedDevices` for device lists
 * instead (see `@synra/plugin-sdk/hooks`).
 */
export function useTransport() {
  const runtime = getConnectionRuntime()

  const peers = computed((): DiscoveredDevice[] =>
    [...runtime.devices.value]
      .map((device) => {
        const name =
          typeof device.name === 'string' && device.name.trim().length > 0
            ? device.name.trim()
            : device.deviceId
        return {
          ...device,
          name,
          ipAddress: device.ipAddress ?? '',
          connectable: Boolean(device.connectable)
        }
      })
      .filter((device) => device.ipAddress.length > 0)
      .sort((left, right) => right.lastSeenAt - left.lastSeenAt)
  )

  const openTransportLinks = computed(() => [...runtime.openTransportLinks.value])

  function findTransportReadyLinkByPeer(deviceId: string) {
    return findReadyTransportLinkForDevice({
      deviceId,
      devices: peers.value,
      links: runtime.openTransportLinks.value
    })
  }

  async function ensureReady(): Promise<void> {
    await runtime.ensureListeners()
  }

  async function startScan(): Promise<void> {
    // SYNRA-COMM::PLUGIN_BRIDGE::CONNECT::UI_START_SCAN
    // Manual scan can run before connect-page onMounted finishes ensureReady(); without this,
    // discovery.start may run while DeviceConnection has not yet subscribed to onHostEvent
    // (inbound pairing events are then dropped on Electron).
    await runtime.ensureListeners()
    await runtime.startDiscovery()
  }

  async function connectToDevice(
    deviceId: string,
    connectOptions?: ConnectToDeviceOptions
  ): Promise<string | undefined> {
    // SYNRA-COMM::PLUGIN_BRIDGE::CONNECT::UI_CONNECT_TO_DEVICE
    const target = peers.value.find((peer) => peer.deviceId === deviceId)
    if (!target || !target.ipAddress) {
      return undefined
    }
    const openedLink = findTransportReadyLinkByPeer(deviceId)
    if (openedLink?.deviceId) {
      return openedLink.deviceId
    }
    await runtime.ensureListeners()
    await runtime.openTransport({
      deviceId: target.deviceId,
      host: target.ipAddress,
      port: target.port ?? 32100,
      suppressGlobalError: connectOptions?.suppressGlobalError
    })
    const byPeer = findTransportReadyLinkByPeer(deviceId)
    if (byPeer?.deviceId) {
      return byPeer.deviceId
    }
    const snapshot = runtime.primaryTransportState.value
    if (snapshot.deviceId === deviceId && snapshot.state === 'open') {
      return snapshot.deviceId
    }
    return findTransportReadyLinkByPeer(deviceId)?.deviceId
  }

  async function connectToDeviceAt(
    deviceId: string,
    host: string,
    port: number,
    connectOptions?: ConnectToDeviceOptions
  ): Promise<string | undefined> {
    // SYNRA-COMM::PLUGIN_BRIDGE::CONNECT::UI_CONNECT_TO_DEVICE_AT
    const hostTrimmed = host.trim()
    if (hostTrimmed.length === 0) {
      return undefined
    }
    const resolvedPort = port > 0 ? port : 32100
    const openedLink = findTransportReadyLinkByPeer(deviceId)
    if (openedLink?.deviceId) {
      return openedLink.deviceId
    }
    await runtime.ensureListeners()
    await runtime.openTransport({
      deviceId,
      host: hostTrimmed,
      port: resolvedPort,
      suppressGlobalError: connectOptions?.suppressGlobalError
    })
    const byPeer = findTransportReadyLinkByPeer(deviceId)
    if (byPeer?.deviceId) {
      return byPeer.deviceId
    }
    const snapshot = runtime.primaryTransportState.value
    if (snapshot.deviceId === deviceId && snapshot.state === 'open') {
      return snapshot.deviceId
    }
    return findTransportReadyLinkByPeer(deviceId)?.deviceId
  }

  async function disconnectDevice(deviceId: string): Promise<void> {
    const target = peers.value.find((peer) => peer.deviceId === deviceId)
    const targetHost = target ? normalizeHost(target.ipAddress) : ''
    const liveLinks = runtime.openTransportLinks.value.filter((link) => {
      if (!isTransportLive(link)) {
        return false
      }
      if (link.deviceId === deviceId) {
        return true
      }
      if (targetHost.length === 0) {
        return false
      }
      return normalizeHost(link.host) === targetHost
    })
    if (liveLinks.length === 0) {
      return
    }
    for (const link of liveLinks) {
      await runtime.closeTransport(link.deviceId)
    }
  }

  return {
    peers,
    openTransportLinks,
    scanState: runtime.scanState,
    loading: runtime.loading,
    error: runtime.error,
    ensureReady,
    startScan,
    connectToDevice,
    connectToDeviceAt,
    disconnectDevice
  }
}
