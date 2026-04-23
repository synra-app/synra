import type { DiscoveredDevice } from '@synra/capacitor-lan-discovery'
import type { SynraMessageType } from '@synra/protocol'
import { computed } from 'vue'
import type {
  SynraConnectionFilter,
  SynraConnectionMessage,
  RuntimeOpenSessionInput,
  SynraLanWireSendInput
} from '../types'
import { getConnectionRuntime } from '../runtime/core'
import { type DeviceProfileUpdatedPayload } from '../runtime/device-profile'
import { normalizeHost } from '../runtime/host-normalization'

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

export type ConnectToDeviceOptions = Pick<RuntimeOpenSessionInput, 'suppressGlobalError'>

function isTransportLive(session: { transport: string }): boolean {
  return session.transport === 'ready' || session.transport === 'handshaking'
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
      runtime.connectedSessions.value
        .filter((session) => session.transport === 'ready')
        .reduce((set, session) => {
          if (typeof session.deviceId === 'string' && session.deviceId.length > 0) {
            set.add(session.deviceId)
          }
          const sessionHost = normalizeHost(session.host)
          if (sessionHost.length > 0) {
            for (const peer of peers.value) {
              if (normalizeHost(peer.ipAddress) === sessionHost) {
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
      runtime.connectedSessions.value
        .filter((session) => session.transport === 'ready' && session.app === 'connected')
        .reduce((set, session) => {
          if (typeof session.deviceId === 'string' && session.deviceId.length > 0) {
            set.add(session.deviceId)
          }
          const sessionHost = normalizeHost(session.host)
          if (sessionHost.length > 0) {
            for (const peer of peers.value) {
              if (normalizeHost(peer.ipAddress) === sessionHost) {
                set.add(peer.deviceId)
              }
            }
          }
          return set
        }, new Set<string>())
    )
  )

  const connectedSessions = computed(() => [...runtime.connectedSessions.value])

  function findTransportReadySessionByPeer(deviceId: string) {
    const target = peers.value.find((peer) => peer.deviceId === deviceId)
    const targetHost = target ? normalizeHost(target.ipAddress) : ''
    return runtime.connectedSessions.value.find((session) => {
      if (session.transport !== 'ready') {
        return false
      }
      if (session.deviceId === deviceId) {
        return true
      }
      if (targetHost.length === 0) {
        return false
      }
      return normalizeHost(session.host) === targetHost
    })
  }

  async function ensureReady(): Promise<void> {
    await runtime.ensureListeners()
  }

  async function startScan(): Promise<void> {
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
    const openedSession = findTransportReadySessionByPeer(deviceId)
    if (openedSession?.deviceId) {
      return openedSession.deviceId
    }
    await runtime.openSession({
      deviceId: target.deviceId,
      host: target.ipAddress,
      port: target.port ?? 32100,
      suppressGlobalError: connectOptions?.suppressGlobalError
    })
    const byPeer = findTransportReadySessionByPeer(deviceId)
    if (byPeer?.deviceId) {
      return byPeer.deviceId
    }
    const snapshot = runtime.sessionState.value
    if (snapshot.deviceId === deviceId && snapshot.state === 'open') {
      return snapshot.deviceId
    }
    return findTransportReadySessionByPeer(deviceId)?.deviceId
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
    const openedSession = findTransportReadySessionByPeer(deviceId)
    if (openedSession?.deviceId) {
      return openedSession.deviceId
    }
    await runtime.openSession({
      deviceId,
      host: hostTrimmed,
      port: resolvedPort,
      suppressGlobalError: connectOptions?.suppressGlobalError
    })
    const byPeer = findTransportReadySessionByPeer(deviceId)
    if (byPeer?.deviceId) {
      return byPeer.deviceId
    }
    const snapshot = runtime.sessionState.value
    if (snapshot.deviceId === deviceId && snapshot.state === 'open') {
      return snapshot.deviceId
    }
    return findTransportReadySessionByPeer(deviceId)?.deviceId
  }

  async function disconnectDevice(deviceId: string): Promise<void> {
    const target = peers.value.find((peer) => peer.deviceId === deviceId)
    const targetHost = target ? normalizeHost(target.ipAddress) : ''
    const liveSessions = runtime.connectedSessions.value.filter((session) => {
      if (!isTransportLive(session)) {
        return false
      }
      if (session.deviceId === deviceId) {
        return true
      }
      if (targetHost.length === 0) {
        return false
      }
      return normalizeHost(session.host) === targetHost
    })
    if (liveSessions.length === 0) {
      return
    }
    for (const session of liveSessions) {
      await runtime.closeSession(session.deviceId)
    }
  }

  async function resolveTargetDeviceId(deviceId: string): Promise<string | undefined> {
    const opened = findTransportReadySessionByPeer(deviceId)
    if (opened?.deviceId) {
      return opened.deviceId
    }
    const openedDeviceId = await connectToDevice(deviceId)
    if (openedDeviceId) {
      return openedDeviceId
    }
    const connected = findTransportReadySessionByPeer(deviceId)
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

  async function broadcastDeviceProfileToOpenSessions(
    profile: DeviceProfileUpdatedPayload
  ): Promise<void> {
    const sessions = runtime.connectedSessions.value.filter(
      (s) => s.transport === 'ready' && typeof s.deviceId === 'string' && s.deviceId.length > 0
    )
    await Promise.all(
      sessions.map((s) =>
        runtime
          .sendLanEvent({
            requestId: crypto.randomUUID(),
            sourceDeviceId: 'local-device',
            targetDeviceId: s.deviceId,
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
    connectedSessions,
    scanState: runtime.scanState,
    loading: runtime.loading,
    error: runtime.error,
    ensureReady,
    startScan,
    connectToDevice,
    connectToDeviceAt,
    disconnectDevice,
    sendToDevice,
    broadcastDeviceProfileToOpenSessions,
    broadcast,
    sendConnectionMessage,
    sendLanEvent,
    onMessage,
    onSynraMessage
  }
}
