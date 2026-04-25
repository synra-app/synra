import type { DiscoveredDevice } from '@synra/capacitor-lan-discovery'
import type { SynraMessageType } from '@synra/protocol'
import { computed } from 'vue'
import type {
  SynraConnectionFilter,
  SynraConnectionMessage,
  RuntimeOpenTransportInput,
  SynraLanWireSendInput
} from '../types'
import { getConnectionRuntime } from '../runtime/core'
import { type DeviceProfileUpdatedPayload } from '../runtime/device-profile'
import { normalizeHost } from '../runtime/host-normalization'
import { findReadyTransportLinkForDevice } from '../runtime/ready-transport-link'

type SynraTransportOutgoing = {
  channel?: string
  payload: unknown
}

type SynraTransportIncoming = {
  fromDeviceId?: string
  requestId?: string
  channel: string
  payload: unknown
  receivedAt: number
}

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

  /** Peers with physical TCP up (Synra transport usable). */
  const transportReadyDeviceIds = computed(() =>
    Array.from(
      runtime.openTransportLinks.value
        .filter((link) => link.transport === 'ready')
        .reduce((set, link) => {
          if (typeof link.deviceId === 'string' && link.deviceId.length > 0) {
            set.add(link.deviceId)
          }
          const linkHost = normalizeHost(link.host)
          if (linkHost.length > 0) {
            for (const peer of peers.value) {
              if (normalizeHost(peer.ipAddress) === linkHost) {
                set.add(peer.deviceId)
              }
            }
          }
          return set
        }, new Set<string>())
    )
  )

  /** Peers with application-level link ready (UI green / chat gating). */
  const appReadyDeviceIds = computed(() =>
    Array.from(
      runtime.openTransportLinks.value
        .filter((link) => link.transport === 'ready' && link.app === 'connected')
        .reduce((set, link) => {
          if (typeof link.deviceId === 'string' && link.deviceId.length > 0) {
            set.add(link.deviceId)
          }
          const linkHost = normalizeHost(link.host)
          if (linkHost.length > 0) {
            for (const peer of peers.value) {
              if (normalizeHost(peer.ipAddress) === linkHost) {
                set.add(peer.deviceId)
              }
            }
          }
          return set
        }, new Set<string>())
    )
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

  async function sendToDevice(deviceId: string, message: SynraTransportOutgoing): Promise<void> {
    const targetDeviceId = await resolveTargetDeviceId(deviceId)
    if (!targetDeviceId) {
      throw new Error(`Device ${deviceId} is not connected.`)
    }
    const requestId = crypto.randomUUID()
    await runtime.sendMessage({
      requestId,
      sourceDeviceId: 'local-device',
      targetDeviceId,
      messageType: 'custom.chat.text',
      payload: {
        channel: message.channel ?? 'default',
        body: message.payload
      }
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
            sourceDeviceId: 'local-device',
            targetDeviceId: link.deviceId,
            eventName: 'device.displayName.changed',
            payload: { deviceId: profile.deviceId, displayName: profile.displayName }
          })
          .catch(() => undefined)
      )
    )
  }

  async function broadcast(message: SynraTransportOutgoing): Promise<void> {
    const failures: Array<{ deviceId: string; error: unknown }> = []
    const tasks = peers.value.map(async (peer) => {
      try {
        await sendToDevice(peer.deviceId, message)
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

  async function sendConnectionMessage(input: {
    requestId: string
    sourceDeviceId: string
    targetDeviceId: string
    replyToRequestId?: string
    messageType: SynraMessageType
    payload: unknown
    messageId?: string
  }): Promise<void> {
    await runtime.sendMessage({
      requestId: input.requestId,
      sourceDeviceId: input.sourceDeviceId,
      targetDeviceId: input.targetDeviceId,
      replyToRequestId: input.replyToRequestId,
      messageType: input.messageType,
      payload: input.payload,
      messageId: input.messageId
    })
  }

  async function sendLanEvent(input: SynraLanWireSendInput): Promise<void> {
    await runtime.sendLanEvent(input)
  }

  function onSynraMessage(
    handler: (message: SynraConnectionMessage) => void | Promise<void>,
    filter?: SynraConnectionFilter
  ): () => void {
    return runtime.onMessage(handler, filter)
  }

  function onMessage(
    handler: (message: SynraTransportIncoming) => void | Promise<void>
  ): () => void {
    const unsubscribe = runtime.onMessage((message) => {
      if (message.messageType !== 'custom.chat.text') {
        return
      }
      const payload =
        message.payload && typeof message.payload === 'object'
          ? (message.payload as { channel?: unknown; body?: unknown })
          : {}
      const channel = typeof payload.channel === 'string' ? payload.channel : 'default'
      const body = 'body' in payload ? payload.body : message.payload
      void Promise.resolve(
        handler({
          fromDeviceId: message.sourceDeviceId,
          requestId: message.requestId,
          channel,
          payload: body,
          receivedAt: message.timestamp
        })
      )
    })
    return () => {
      unsubscribe()
    }
  }

  return {
    peers,
    transportReadyDeviceIds,
    appReadyDeviceIds,
    openTransportLinks,
    scanState: runtime.scanState,
    loading: runtime.loading,
    error: runtime.error,
    ensureReady,
    startScan,
    connectToDevice,
    connectToDeviceAt,
    disconnectDevice,
    sendToDevice,
    broadcastDeviceProfileToOpenTransportLinks,
    broadcast,
    sendConnectionMessage,
    sendLanEvent,
    onMessage,
    onSynraMessage
  }
}
