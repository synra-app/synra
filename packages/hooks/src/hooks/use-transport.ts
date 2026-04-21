import { computed } from 'vue'
import { getConnectionRuntime } from '../runtime/core'
import { normalizeHost } from '../runtime/host-normalization'

type SynraTransportPeer = {
  deviceId: string
  name: string
  ipAddress: string
  port?: number
  source?: string
  connectable: boolean
  lastSeenAt?: number
}

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

function toPeer(input: {
  deviceId: string
  name?: string
  ipAddress?: string
  port?: number
  source?: string
  connectable?: boolean
  lastSeenAt?: number
}): SynraTransportPeer {
  return {
    deviceId: input.deviceId,
    name: input.name ?? input.deviceId,
    ipAddress: input.ipAddress ?? '',
    port: input.port,
    source: input.source,
    connectable: Boolean(input.connectable),
    lastSeenAt: input.lastSeenAt
  }
}

export function useTransport() {
  const runtime = getConnectionRuntime()

  const peers = computed(() =>
    [...runtime.devices.value]
      .map((device) => toPeer(device))
      .filter((device) => device.ipAddress.length > 0)
      .sort((left, right) => (right.lastSeenAt ?? 0) - (left.lastSeenAt ?? 0))
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

  function findOpenSessionByPeer(deviceId: string) {
    const target = peers.value.find((peer) => peer.deviceId === deviceId)
    if (!target) {
      return undefined
    }
    const targetHost = normalizeHost(target.ipAddress)
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

  async function connectToDevice(deviceId: string): Promise<string | undefined> {
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
      port: target.port ?? 32100
    })
    const fromState =
      typeof runtime.sessionState.value.sessionId === 'string'
        ? runtime.sessionState.value.sessionId
        : undefined
    if (fromState) {
      return fromState
    }
    return findOpenSessionByPeer(deviceId)?.sessionId
  }

  async function disconnectDevice(deviceId: string): Promise<void> {
    const session = findOpenSessionByPeer(deviceId)
    if (!session?.sessionId) {
      return
    }
    await runtime.closeSession(session.sessionId)
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

  function onMessage(
    handler: (message: SynraTransportIncoming) => void | Promise<void>
  ): () => void {
    const unsubscribe = runtime.onMessage((message) => {
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
    scanState: runtime.scanState,
    loading: runtime.loading,
    error: runtime.error,
    ensureReady,
    startScan,
    connectToDevice,
    disconnectDevice,
    sendToDevice,
    broadcast,
    onMessage
  }
}
