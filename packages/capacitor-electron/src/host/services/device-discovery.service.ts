import { BridgeError } from '../../shared/errors/bridge-error'
import { BRIDGE_ERROR_CODES } from '../../shared/errors/codes'
import type {
  DeviceDiscoveryHostEvent,
  DeviceDiscoveryListResult,
  DeviceDiscoveryPullHostEventsResult,
  DeviceDiscoveryStartOptions,
  DeviceDiscoveryStartResult,
  DeviceSessionCloseOptions,
  DeviceSessionCloseResult,
  DeviceSessionGetStateOptions,
  DeviceSessionOpenOptions,
  DeviceSessionOpenResult,
  DeviceSessionSendMessageOptions,
  DeviceSessionSendMessageResult,
  DeviceSessionSnapshot
} from '../../shared/protocol/types'
import { DEFAULT_HEARTBEAT_INTERVAL_MS } from './device-discovery/core/constants'
import { getOrCreateLocalDeviceUuid } from './device-discovery/core/device-identity'
import { createDiscoveryOrchestrator } from './device-discovery/discovery/discovery-orchestrator'
import { createProbeSocketRegistry } from './device-discovery/discovery/probe-socket-registry'
import { createManualDiscoveryStrategy } from './device-discovery/discovery/strategies/manual.strategy'
import { createMdnsDiscoveryStrategy } from './device-discovery/discovery/strategies/mdns.strategy'
import { createUdpDiscoveryStrategy } from './device-discovery/discovery/strategies/udp.strategy'
import { createHostEventBus } from './device-discovery/events/host-event-bus'
import { createInboundHostTransport } from './device-discovery/session/inbound-host-transport'
import { createOutboundClientSession } from './device-discovery/session/outbound-client-session'
import { createDeviceRegistry } from './device-discovery/state/device-registry'

type DeviceDiscoveryServiceOptions = {
  onHostEvent?: (event: DeviceDiscoveryHostEvent) => void
  resolveLocalDeviceUuid?: () => string
  readPairedPeerDeviceIds?: () => string[]
}

export interface DeviceDiscoveryService {
  startDiscovery(options?: DeviceDiscoveryStartOptions): Promise<DeviceDiscoveryStartResult>
  stopDiscovery(): Promise<{ success: true }>
  listDevices(): Promise<DeviceDiscoveryListResult>
  openSession(options: DeviceSessionOpenOptions): Promise<DeviceSessionOpenResult>
  closeSession(options?: DeviceSessionCloseOptions): Promise<DeviceSessionCloseResult>
  sendMessage(options: DeviceSessionSendMessageOptions): Promise<DeviceSessionSendMessageResult>
  getSessionState(options?: DeviceSessionGetStateOptions): Promise<DeviceSessionSnapshot>
  pullHostEvents(): Promise<DeviceDiscoveryPullHostEventsResult>
}

export function createDeviceDiscoveryService(
  options: DeviceDiscoveryServiceOptions = {}
): DeviceDiscoveryService {
  const resolveLocalDeviceUuid = options.resolveLocalDeviceUuid ?? getOrCreateLocalDeviceUuid
  const readPairedPeerDeviceIds = options.readPairedPeerDeviceIds
  const registry = createDeviceRegistry()
  const eventBus = createHostEventBus(options.onHostEvent)
  const probeSocketRegistry = createProbeSocketRegistry()
  const orchestrator = createDiscoveryOrchestrator({
    registry,
    strategies: [
      createMdnsDiscoveryStrategy(),
      createUdpDiscoveryStrategy(),
      createManualDiscoveryStrategy()
    ],
    resolveLocalDeviceUuid,
    probeSocketRegistry
  })
  const inboundTransport = createInboundHostTransport({
    eventBus,
    resolveLocalDeviceUuid,
    readPairedPeerDeviceIds
  })
  const outboundSession = createOutboundClientSession({
    eventBus,
    resolveLocalDeviceUuid,
    readPairedPeerDeviceIds,
    probeSocketRegistry
  })

  let heartbeatTimer: NodeJS.Timeout | undefined
  let hostStarted = false

  const ensureHostStarted = async () => {
    if (hostStarted) {
      return
    }
    await inboundTransport.start()
    heartbeatTimer = setInterval(() => {
      void inboundTransport.heartbeatTick()
      void outboundSession.heartbeatTick()
    }, DEFAULT_HEARTBEAT_INTERVAL_MS)
    hostStarted = true
  }

  const stopHost = async () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = undefined
    }
    probeSocketRegistry.closeAll()
    await outboundSession.close().catch(() => undefined)
    await inboundTransport.stop()
    hostStarted = false
  }

  const resolveSessionState = async (
    queryOptions: DeviceSessionGetStateOptions = {}
  ): Promise<DeviceSessionSnapshot> => {
    if (queryOptions.sessionId) {
      const inboundState = inboundTransport.getSessionState(queryOptions.sessionId)
      if (inboundState) {
        return inboundState
      }
      return outboundSession.getState(queryOptions)
    }
    const outboundState = await outboundSession.getState()
    if (outboundState.state === 'open') {
      return outboundState
    }
    return inboundTransport.getSessionState() ?? outboundState
  }

  return {
    async startDiscovery(startOptions = {}) {
      await ensureHostStarted()
      return orchestrator.start(startOptions)
    },
    async stopDiscovery() {
      await orchestrator.stop()
      await stopHost()
      return { success: true }
    },
    async listDevices() {
      const snapshot = await orchestrator.list()
      return {
        ...snapshot,
        devices: registry.list()
      }
    },
    async openSession(openOptions) {
      await ensureHostStarted()
      return outboundSession.open(openOptions)
    },
    async closeSession(closeOptions = {}) {
      const targetSessionId = closeOptions.sessionId
      if (!targetSessionId) {
        await outboundSession.close(closeOptions)
        await inboundTransport.closeSession()
        return {
          success: true,
          sessionId: undefined,
          transport: 'tcp'
        }
      }
      const outboundState = await outboundSession.getState()
      if (outboundState.sessionId === targetSessionId) {
        return outboundSession.close(closeOptions)
      }
      await inboundTransport.closeSession(targetSessionId)
      return {
        success: true,
        sessionId: targetSessionId,
        transport: 'tcp'
      }
    },
    async sendMessage(sendOptions) {
      const outboundState = await outboundSession.getState({ sessionId: sendOptions.sessionId })
      if (outboundState.state === 'open' && outboundState.sessionId === sendOptions.sessionId) {
        return outboundSession.sendMessage(sendOptions)
      }
      const sentViaInbound = await inboundTransport.sendMessage(sendOptions)
      if (!sentViaInbound) {
        throw new BridgeError(BRIDGE_ERROR_CODES.unsupportedOperation, 'Session is not open.')
      }
      return {
        success: true,
        messageId: sendOptions.messageId ?? `${Date.now()}`,
        sessionId: sendOptions.sessionId,
        transport: 'tcp'
      }
    },
    async getSessionState(getStateOptions = {}) {
      return resolveSessionState(getStateOptions)
    },
    async pullHostEvents() {
      return eventBus.drain()
    }
  }
}
