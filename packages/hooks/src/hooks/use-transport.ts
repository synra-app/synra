import type { DiscoveredDevice } from '@synra/capacitor-lan-discovery'
import type { SynraMessageType } from '@synra/protocol'
import { computed } from 'vue'
import type {
  SynraConnectionFilter,
  SynraConnectionMessage,
  RuntimeOpenSessionInput
} from '../types'
import { getConnectionRuntime } from '../runtime/core'
import {
  DEVICE_PROFILE_UPDATED_MESSAGE_TYPE,
  type DeviceProfileUpdatedPayload
} from '../runtime/device-profile'
import { normalizeHost, normalizeHostKey } from '../runtime/host-normalization'

type SynraTransportOutgoing = {
  channel?: string
  payload: unknown
}

type SynraTransportIncoming = {
  fromDeviceId?: string
  sessionId?: string
  channel: string
  payload: unknown
  receivedAt: number
}

export type ConnectToDeviceOptions = Pick<RuntimeOpenSessionInput, 'suppressGlobalError'>

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

  const connectedDeviceIds = computed(() =>
    Array.from(
      runtime.connectedSessions.value
        .filter((session) => session.status === 'open')
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

  function findOpenSessionByPeer(deviceId: string) {
    const target = peers.value.find((peer) => peer.deviceId === deviceId)
    const targetHost = target ? normalizeHost(target.ipAddress) : ''
    return runtime.connectedSessions.value.find((session) => {
      if (session.status !== 'open') {
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
    const openedSession = findOpenSessionByPeer(deviceId)
    if (openedSession?.sessionId) {
      return openedSession.sessionId
    }
    await runtime.openSession({
      deviceId: target.deviceId,
      host: target.ipAddress,
      port: target.port ?? 32100,
      suppressGlobalError: connectOptions?.suppressGlobalError
    })
    const byPeer = findOpenSessionByPeer(deviceId)
    if (byPeer?.sessionId) {
      return byPeer.sessionId
    }
    const snapshot = runtime.sessionState.value
    if (
      typeof snapshot.sessionId === 'string' &&
      snapshot.deviceId === deviceId &&
      snapshot.state === 'open'
    ) {
      return snapshot.sessionId
    }
    return findOpenSessionByPeer(deviceId)?.sessionId
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
    const openedSession = findOpenSessionByPeer(deviceId)
    if (openedSession?.sessionId) {
      return openedSession.sessionId
    }
    await runtime.openSession({
      deviceId,
      host: hostTrimmed,
      port: resolvedPort,
      suppressGlobalError: connectOptions?.suppressGlobalError
    })
    const byPeer = findOpenSessionByPeer(deviceId)
    if (byPeer?.sessionId) {
      return byPeer.sessionId
    }
    const snapshot = runtime.sessionState.value
    if (
      typeof snapshot.sessionId === 'string' &&
      snapshot.deviceId === deviceId &&
      snapshot.state === 'open'
    ) {
      return snapshot.sessionId
    }
    return findOpenSessionByPeer(deviceId)?.sessionId
  }

  async function disconnectDevice(deviceId: string): Promise<void> {
    const target = peers.value.find((peer) => peer.deviceId === deviceId)
    const targetHost = target ? normalizeHost(target.ipAddress) : ''
    const openSessions = runtime.connectedSessions.value.filter((session) => {
      if (session.status !== 'open') {
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
    if (openSessions.length === 0) {
      return
    }
    const handoffKeys = new Set<string>()
    for (const session of openSessions) {
      const key = normalizeHostKey(session.host, session.port ?? 32100)
      if (key.length > 0) {
        handoffKeys.add(key)
      }
    }
    runtime.invalidateHandoffForHostKeys([...handoffKeys])
    for (const session of openSessions) {
      await runtime.closeSession(session.sessionId)
    }
  }

  async function resolveSessionId(deviceId: string): Promise<string | undefined> {
    const opened = findOpenSessionByPeer(deviceId)
    if (opened?.sessionId) {
      return opened.sessionId
    }
    const openedSessionId = await connectToDevice(deviceId)
    if (openedSessionId) {
      return openedSessionId
    }
    const connected = findOpenSessionByPeer(deviceId)
    return connected?.sessionId
  }

  async function sendToDevice(deviceId: string, message: SynraTransportOutgoing): Promise<void> {
    const sessionId = await resolveSessionId(deviceId)
    if (!sessionId) {
      throw new Error(`Device ${deviceId} is not connected.`)
    }
    await runtime.sendMessage({
      sessionId,
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
      (s) => s.status === 'open' && typeof s.sessionId === 'string' && s.sessionId.length > 0
    )
    await Promise.all(
      sessions.map((s) =>
        runtime
          .sendMessage({
            sessionId: s.sessionId as string,
            messageType: DEVICE_PROFILE_UPDATED_MESSAGE_TYPE,
            payload: profile
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
    sessionId: string
    messageType: SynraMessageType
    payload: unknown
    messageId?: string
  }): Promise<void> {
    await runtime.sendMessage({
      sessionId: input.sessionId,
      messageType: input.messageType,
      payload: input.payload,
      messageId: input.messageId
    })
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
          fromDeviceId: message.deviceId,
          sessionId: message.sessionId,
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
    connectedDeviceIds,
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
    onMessage,
    onSynraMessage
  }
}
