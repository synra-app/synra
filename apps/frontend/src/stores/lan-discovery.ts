import {
  LanDiscovery,
  type DiscoveredDevice,
  type DeviceConnectableUpdatedEvent,
  type StartDiscoveryOptions
} from '@synra/capacitor-lan-discovery'
import {
  DeviceConnection,
  type GetSessionStateResult,
  type HostEvent,
  type MessageAckEvent,
  type MessageReceivedEvent,
  type OpenSessionOptions,
  type SessionClosedEvent,
  type SessionOpenedEvent,
  type SendMessageOptions,
  type TransportErrorEvent
} from '@synra/capacitor-device-connection'
import type { SynraMessageType } from '@synra/protocol'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { CapacitorCapabilityPortAdapter } from '../plugins/capability-port'

function sortDevices(devices: DiscoveredDevice[]): DiscoveredDevice[] {
  return [...devices].sort((left, right) => right.lastSeenAt - left.lastSeenAt)
}

const MAX_EVENT_LOGS = 200
const capabilityPort = new CapacitorCapabilityPortAdapter()

type ConnectionDirection = 'inbound' | 'outbound'
type ConnectionStatus = 'connecting' | 'open' | 'closed'

export type ConnectedSession = {
  sessionId: string
  direction: ConnectionDirection
  status: ConnectionStatus
  remote?: string
  deviceId?: string
  host?: string
  port?: number
  openedAt?: number
  closedAt?: number
  lastActiveAt: number
}

export const useLanDiscoveryStore = defineStore('lan-discovery', () => {
  const scanState = ref<'idle' | 'scanning'>('idle')
  const startedAt = ref<number | undefined>(undefined)
  const scanWindowMs = ref(15_000)
  const devices = ref<DiscoveredDevice[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const sessionState = ref<GetSessionStateResult>({
    state: 'idle',
    transport: 'tcp'
  })
  const eventLogs = ref<
    Array<{
      id: string
      type:
        | 'sessionOpened'
        | 'sessionClosed'
        | 'messageSent'
        | 'messageReceived'
        | 'messageAck'
        | 'transportError'
      payload: unknown
      timestamp: number
    }>
  >([])
  const connectedSessions = ref<ConnectedSession[]>([])
  let listenersRegistered = false

  const pairedDevices = computed(() => devices.value.filter((device) => device.paired))

  function upsertConnectedSession(next: ConnectedSession): void {
    const index = connectedSessions.value.findIndex((item) => item.sessionId === next.sessionId)
    if (index === -1) {
      connectedSessions.value.unshift(next)
    } else {
      connectedSessions.value[index] = {
        ...connectedSessions.value[index],
        ...next
      }
    }

    connectedSessions.value.sort((left, right) => {
      if (left.status === 'open' && right.status !== 'open') {
        return -1
      }
      if (left.status !== 'open' && right.status === 'open') {
        return 1
      }
      return right.lastActiveAt - left.lastActiveAt
    })
  }

  function markConnectionClosed(sessionId: string | undefined, reasonAt: number): void {
    if (!sessionId) {
      return
    }
    const current = connectedSessions.value.find((item) => item.sessionId === sessionId)
    if (!current) {
      return
    }
    upsertConnectedSession({
      ...current,
      status: 'closed',
      closedAt: reasonAt,
      lastActiveAt: reasonAt
    })
  }

  async function refreshDevices(): Promise<void> {
    try {
      const result = await LanDiscovery.getDiscoveredDevices()
      scanState.value = result.state
      startedAt.value = result.startedAt
      scanWindowMs.value = result.scanWindowMs
      devices.value = sortDevices(result.devices)
      await probeConnectable()
      error.value = null
    } catch (unknownError) {
      error.value = unknownError instanceof Error ? unknownError.message : 'Failed to load devices.'
    }
  }

  async function startDiscovery(options: string[] | StartDiscoveryOptions = []): Promise<void> {
    loading.value = true
    try {
      const normalizedOptions: StartDiscoveryOptions = Array.isArray(options)
        ? {
            manualTargets: options
          }
        : options
      const result = await LanDiscovery.startDiscovery({
        discoveryMode: 'hybrid',
        includeLoopback: false,
        enableProbeFallback: true,
        ...normalizedOptions
      })
      scanState.value = result.state
      startedAt.value = result.startedAt
      scanWindowMs.value = result.scanWindowMs
      devices.value = sortDevices(result.devices)
      await probeConnectable()
      error.value = null
    } catch (unknownError) {
      error.value =
        unknownError instanceof Error ? unknownError.message : 'Failed to start discovery.'
    } finally {
      loading.value = false
    }
  }

  async function stopDiscovery(): Promise<void> {
    loading.value = true
    try {
      await LanDiscovery.stopDiscovery()
      scanState.value = 'idle'
      error.value = null
    } catch (unknownError) {
      error.value =
        unknownError instanceof Error ? unknownError.message : 'Failed to stop discovery.'
    } finally {
      loading.value = false
    }
  }

  async function pairDevice(deviceId: string): Promise<void> {
    loading.value = true
    try {
      const result = await LanDiscovery.pairDevice({ deviceId })
      devices.value = sortDevices(
        devices.value.map((device) => (device.deviceId === deviceId ? result.device : device))
      )
      error.value = null
    } catch (unknownError) {
      error.value = unknownError instanceof Error ? unknownError.message : 'Failed to pair device.'
    } finally {
      loading.value = false
    }
  }

  async function probeConnectable(port = 32100, timeoutMs = 1500): Promise<void> {
    try {
      const result = await LanDiscovery.probeConnectable({ port, timeoutMs })
      devices.value = sortDevices(result.devices)
      error.value = null
    } catch (unknownError) {
      error.value =
        unknownError instanceof Error
          ? unknownError.message
          : 'Failed to probe device connectability.'
    }
  }

  async function openSession(options: OpenSessionOptions): Promise<void> {
    loading.value = true
    try {
      const result = await DeviceConnection.openSession(options)
      sessionState.value = {
        sessionId: result.sessionId,
        deviceId: options.deviceId,
        host: options.host,
        port: options.port,
        state: result.state,
        transport: result.transport
      }
      upsertConnectedSession({
        sessionId: result.sessionId,
        direction: 'outbound',
        status: 'open',
        deviceId: options.deviceId,
        host: options.host,
        remote: options.host,
        port: options.port,
        openedAt: Date.now(),
        lastActiveAt: Date.now()
      })
      error.value = null
    } catch (unknownError) {
      error.value = unknownError instanceof Error ? unknownError.message : 'Failed to open session.'
    } finally {
      loading.value = false
    }
  }

  async function closeSession(sessionId?: string): Promise<void> {
    loading.value = true
    try {
      await DeviceConnection.closeSession({ sessionId })
      sessionState.value = {
        ...sessionState.value,
        sessionId,
        state: 'closed',
        closedAt: Date.now()
      }
      markConnectionClosed(sessionId, Date.now())
      error.value = null
    } catch (unknownError) {
      error.value =
        unknownError instanceof Error ? unknownError.message : 'Failed to close session.'
    } finally {
      loading.value = false
    }
  }

  async function sendMessage(options: SendMessageOptions): Promise<void> {
    loading.value = true
    try {
      appendEventLog('messageSent', {
        sessionId: options.sessionId,
        messageId: options.messageId,
        messageType: options.messageType,
        payload: options.payload
      })
      upsertConnectedSession({
        sessionId: options.sessionId,
        direction:
          connectedSessions.value.find((item) => item.sessionId === options.sessionId)?.direction ??
          'outbound',
        status: 'open',
        lastActiveAt: Date.now()
      })
      await capabilityPort.sendCrossDeviceMessage({
        protocolVersion: '1.0',
        messageId: options.messageId ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        sessionId: options.sessionId,
        traceId: `trace-${Date.now()}`,
        type: options.messageType,
        sentAt: Date.now(),
        ttlMs: 60_000,
        fromDeviceId: 'client',
        toDeviceId: 'host',
        payload: options.payload
      })
      error.value = null
    } catch (unknownError) {
      error.value = unknownError instanceof Error ? unknownError.message : 'Failed to send message.'
    } finally {
      loading.value = false
    }
  }

  async function syncSessionState(sessionId?: string): Promise<void> {
    try {
      const snapshot = await DeviceConnection.getSessionState({ sessionId })
      sessionState.value = snapshot
    } catch (unknownError) {
      error.value =
        unknownError instanceof Error ? unknownError.message : 'Failed to sync session state.'
    }
  }

  function appendEventLog(
    type:
      | 'sessionOpened'
      | 'sessionClosed'
      | 'messageSent'
      | 'messageReceived'
      | 'messageAck'
      | 'transportError',
    payload: unknown
  ): void {
    const nextEntry = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      type,
      payload,
      timestamp: Date.now()
    }
    eventLogs.value.unshift(nextEntry)
    if (eventLogs.value.length > MAX_EVENT_LOGS) {
      eventLogs.value.length = MAX_EVENT_LOGS
    }
  }

  async function ensureListeners(): Promise<void> {
    if (listenersRegistered) {
      return
    }

    await LanDiscovery.addListener(
      'deviceConnectableUpdated',
      (event: DeviceConnectableUpdatedEvent) => {
        devices.value = sortDevices(
          devices.value.map((device) =>
            device.deviceId === event.device.deviceId ? event.device : device
          )
        )
      }
    )
    await DeviceConnection.addListener('sessionOpened', (event: SessionOpenedEvent) => {
      appendEventLog('sessionOpened', event)
      sessionState.value = {
        ...sessionState.value,
        sessionId: event.sessionId,
        deviceId: event.deviceId,
        host: event.host,
        port: event.port,
        state: 'open',
        openedAt: Date.now()
      }
      upsertConnectedSession({
        sessionId: event.sessionId,
        direction: 'outbound',
        status: 'open',
        deviceId: event.deviceId,
        host: event.host,
        remote: event.host,
        port: event.port,
        openedAt: Date.now(),
        lastActiveAt: Date.now()
      })
    })
    await DeviceConnection.addListener('sessionClosed', (event: SessionClosedEvent) => {
      appendEventLog('sessionClosed', event)
      sessionState.value = {
        ...sessionState.value,
        state: 'closed',
        closedAt: Date.now()
      }
      markConnectionClosed(event.sessionId, Date.now())
    })
    await DeviceConnection.addListener('messageReceived', (event: MessageReceivedEvent) => {
      appendEventLog('messageReceived', event)
      upsertConnectedSession({
        sessionId: event.sessionId,
        direction:
          connectedSessions.value.find((item) => item.sessionId === event.sessionId)?.direction ??
          'inbound',
        status: 'open',
        lastActiveAt: Date.now()
      })
    })
    await DeviceConnection.addListener('messageAck', (event: MessageAckEvent) => {
      appendEventLog('messageAck', event)
      upsertConnectedSession({
        sessionId: event.sessionId,
        direction:
          connectedSessions.value.find((item) => item.sessionId === event.sessionId)?.direction ??
          'outbound',
        status: 'open',
        lastActiveAt: Date.now()
      })
    })
    await DeviceConnection.addListener('transportError', (event: TransportErrorEvent) => {
      appendEventLog('transportError', event)
      error.value = event.message
    })

    const replayHostEvent = (event: HostEvent): void => {
      if (event.type === 'transport.message.received' && event.sessionId) {
        appendEventLog('messageReceived', event)
        upsertConnectedSession({
          sessionId: event.sessionId,
          direction:
            connectedSessions.value.find((item) => item.sessionId === event.sessionId)?.direction ??
            'inbound',
          status: 'open',
          lastActiveAt: Date.now()
        })
      } else if (event.type === 'transport.message.ack' && event.sessionId) {
        appendEventLog('messageAck', event)
        upsertConnectedSession({
          sessionId: event.sessionId,
          direction:
            connectedSessions.value.find((item) => item.sessionId === event.sessionId)?.direction ??
            'outbound',
          status: 'open',
          lastActiveAt: Date.now()
        })
      } else if (event.type === 'transport.session.opened' && event.sessionId) {
        appendEventLog('sessionOpened', event)
        upsertConnectedSession({
          sessionId: event.sessionId,
          direction:
            connectedSessions.value.find((item) => item.sessionId === event.sessionId)?.direction ??
            'inbound',
          status: 'open',
          remote: event.remote,
          openedAt: event.timestamp,
          lastActiveAt: Date.now()
        })
      } else if (event.type === 'transport.session.closed') {
        appendEventLog('sessionClosed', event)
        markConnectionClosed(event.sessionId, Date.now())
      } else if (event.type === 'transport.error') {
        appendEventLog('transportError', event)
      }
    }

    const hostReplay = await DeviceConnection.pullHostEvents()
    for (const hostEvent of hostReplay.events) {
      replayHostEvent(hostEvent)
    }

    const snapshot = await DeviceConnection.getSessionState()
    sessionState.value = snapshot
    if (snapshot.state === 'open' && snapshot.sessionId) {
      upsertConnectedSession({
        sessionId: snapshot.sessionId,
        direction: 'outbound',
        status: 'open',
        deviceId: snapshot.deviceId,
        host: snapshot.host,
        remote: snapshot.host,
        port: snapshot.port,
        openedAt: snapshot.openedAt,
        lastActiveAt: Date.now()
      })
    }
    listenersRegistered = true
  }

  return {
    scanState,
    startedAt,
    scanWindowMs,
    devices,
    pairedDevices,
    loading,
    error,
    sessionState,
    connectedSessions,
    eventLogs,
    ensureListeners,
    startDiscovery,
    stopDiscovery,
    refreshDevices,
    pairDevice,
    probeConnectable,
    openSession,
    closeSession,
    sendMessage,
    syncSessionState
  }
})

export type LanStoreSendMessageInput<TType extends SynraMessageType = SynraMessageType> = {
  sessionId: string
  messageType: TType
  payload: unknown
  messageId?: string
}
