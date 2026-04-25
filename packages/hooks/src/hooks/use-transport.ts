import type { DiscoveredDevice } from '@synra/capacitor-lan-discovery'
import { DEVICE_DISPLAY_NAME_CHANGED_EVENT } from '@synra/protocol'
import { computed } from 'vue'
import type {
  SynraConnectionFilter,
  SynraConnectionSendInput,
  SynraConnectionMessage,
  SendMessageToReadyDeviceInput,
  TransportBroadcastMessageInput,
  RuntimeOpenTransportInput,
  SynraLanWireSendInput
} from '../types'
import { getConnectionRuntime } from '../runtime/core'
import { type DeviceProfileUpdatedPayload } from '../runtime/device-profile'
import { normalizeHost } from '../runtime/host-normalization'
import { findReadyTransportLinkForDevice } from '../runtime/ready-transport-link'

export type ConnectToDeviceOptions = Pick<RuntimeOpenTransportInput, 'suppressGlobalError'>

function isTransportLive(link: { transport: string }): boolean {
  return link.transport === 'ready' || link.transport === 'handshaking'
}

/**
 * Full transport including discovery (`startScan`). Host apps use this for the
 * device screen. Plugins must not call discovery APIs; use `usePairedDevices`
 * for device lists instead (see `@synra/plugin-sdk/hooks`).
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
    // SYNRA-COMM::UDP_DISCOVERY::CONNECT::UI_START_SCAN
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

  async function resolveTargetDeviceId(deviceId: string): Promise<string | undefined> {
    const opened = findTransportReadyLinkByPeer(deviceId)
    if (opened?.deviceId) {
      return opened.deviceId
    }
    const openedDeviceId = await connectToDevice(deviceId)
    if (openedDeviceId) {
      return openedDeviceId
    }
    const connected = findTransportReadyLinkByPeer(deviceId)
    return connected?.deviceId
  }

  async function sendMessageToReadyDevice(input: SendMessageToReadyDeviceInput): Promise<void> {
    // SYNRA-COMM::PLUGIN_BRIDGE::SEND::UI_SEND_READY_MESSAGE
    const readyLink = findTransportReadyLinkByPeer(input.deviceId)
    if (!readyLink?.deviceId) {
      throw new Error(`Device ${input.deviceId} is not ready for sending.`)
    }
    await runtime.sendMessage({
      requestId: crypto.randomUUID(),
      from: input.from ?? 'local-device',
      target: input.deviceId,
      replyRequestId: input.replyRequestId,
      event: input.event,
      payload: input.payload,
      timestamp: input.timestamp
    })
  }

  async function broadcastDeviceProfileToOpenTransportLinks(
    profile: DeviceProfileUpdatedPayload
  ): Promise<void> {
    const links = runtime.openTransportLinks.value.filter(
      (link) =>
        link.transport === 'ready' && typeof link.deviceId === 'string' && link.deviceId.length > 0
    )
    await Promise.all(
      links.map((link) =>
        runtime
          .sendLanEvent({
            requestId: crypto.randomUUID(),
            from: 'local-device',
            target: link.deviceId,
            event: DEVICE_DISPLAY_NAME_CHANGED_EVENT,
            payload: { deviceId: profile.deviceId, displayName: profile.displayName }
          })
          .catch(() => undefined)
      )
    )
  }

  async function broadcastMessage(input: TransportBroadcastMessageInput): Promise<void> {
    const failures: Array<{ deviceId: string; error: unknown }> = []
    const tasks = peers.value.map(async (peer) => {
      try {
        const targetDeviceId = await resolveTargetDeviceId(peer.deviceId)
        if (!targetDeviceId) {
          throw new Error(`Device ${peer.deviceId} is not connected.`)
        }
        await runtime.sendMessage({
          requestId: crypto.randomUUID(),
          from: input.from ?? 'local-device',
          target: targetDeviceId,
          event: input.event,
          payload: input.payload
        })
      } catch (error) {
        failures.push({ deviceId: peer.deviceId, error })
      }
    })
    await Promise.all(tasks)
    if (failures.length > 0) {
      throw new AggregateError(
        failures.map((item) => item.error),
        `Broadcast failed for ${failures.length} device(s): ${failures
          .map((item) => item.deviceId)
          .join(', ')}`
      )
    }
  }

  async function sendConnectionMessage(input: SynraConnectionSendInput): Promise<void> {
    // SYNRA-COMM::PLUGIN_BRIDGE::SEND::UI_SEND_CONNECTION_MESSAGE
    await runtime.sendMessage({
      requestId: input.requestId,
      from: input.from,
      target: input.target,
      replyRequestId: input.replyRequestId,
      event: input.event,
      payload: input.payload,
      timestamp: input.timestamp
    })
  }

  async function sendLanEvent(input: SynraLanWireSendInput): Promise<void> {
    // SYNRA-COMM::PLUGIN_BRIDGE::SEND::UI_SEND_LAN_EVENT
    await runtime.sendLanEvent(input)
  }

  function onSynraMessage(
    handler: (message: SynraConnectionMessage) => void | Promise<void>,
    filter?: SynraConnectionFilter
  ): () => void {
    return runtime.onMessage(handler, filter)
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
    disconnectDevice,
    sendMessageToReadyDevice,
    broadcastDeviceProfileToOpenTransportLinks,
    broadcastMessage,
    sendConnectionMessage,
    sendLanEvent,
    onSynraMessage
  }
}
