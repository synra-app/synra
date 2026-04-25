import { BridgeError } from '../../shared/errors/bridge-error'
import { BRIDGE_ERROR_CODES } from '../../shared/errors/codes'
import type {
  DeviceDiscoveryHostEvent,
  DeviceDiscoveryListResult,
  DeviceDiscoveryPullHostEventsResult,
  DeviceDiscoveryStartOptions,
  DeviceDiscoveryStartResult,
  DeviceTransportCloseOptions,
  DeviceTransportCloseResult,
  DeviceTransportGetStateOptions,
  DeviceTransportOpenOptions,
  DeviceTransportOpenResult,
  DeviceTransportSendLanEventOptions,
  DeviceTransportSendLanEventResult,
  DeviceTransportSendMessageOptions,
  DeviceTransportSendMessageResult,
  DeviceTransportSnapshot
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
import { createOutboundClientTransport } from './device-discovery/session/outbound-client-session'
import { createDeviceRegistry } from './device-discovery/state/device-registry'

type DeviceDiscoveryServiceOptions = {
  onHostEvent?: (event: DeviceDiscoveryHostEvent) => void
  resolveLocalDeviceUuid?: () => string
}

export interface DeviceDiscoveryService {
  startDiscovery(options?: DeviceDiscoveryStartOptions): Promise<DeviceDiscoveryStartResult>
  stopDiscovery(): Promise<{ success: true }>
  listDevices(): Promise<DeviceDiscoveryListResult>
  openTransport(options: DeviceTransportOpenOptions): Promise<DeviceTransportOpenResult>
  closeTransport(options?: DeviceTransportCloseOptions): Promise<DeviceTransportCloseResult>
  sendMessage(options: DeviceTransportSendMessageOptions): Promise<DeviceTransportSendMessageResult>
  sendLanEvent(
    options: DeviceTransportSendLanEventOptions
  ): Promise<DeviceTransportSendLanEventResult>
  getTransportState(options?: DeviceTransportGetStateOptions): Promise<DeviceTransportSnapshot>
  pullHostEvents(): Promise<DeviceDiscoveryPullHostEventsResult>
}

export function createDeviceDiscoveryService(
  options: DeviceDiscoveryServiceOptions = {}
): DeviceDiscoveryService {
  const resolveLocalDeviceUuid = options.resolveLocalDeviceUuid ?? getOrCreateLocalDeviceUuid
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
    resolveLocalDeviceUuid
  })
  const outboundTransport = createOutboundClientTransport({
    eventBus,
    resolveLocalDeviceUuid,
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
      void outboundTransport.heartbeatTick()
    }, DEFAULT_HEARTBEAT_INTERVAL_MS)
    hostStarted = true
  }

  const stopHost = async () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = undefined
    }
    probeSocketRegistry.closeAll()
    await outboundTransport.close().catch(() => undefined)
    await inboundTransport.stop()
    hostStarted = false
  }

  const resolveTransportState = async (
    queryOptions: DeviceTransportGetStateOptions = {}
  ): Promise<DeviceTransportSnapshot> => {
    if (queryOptions.target) {
      const inboundState = inboundTransport.getTransportState(queryOptions.target)
      if (inboundState) {
        return inboundState
      }
      return outboundTransport.getState(queryOptions)
    }
    const outboundState = await outboundTransport.getState()
    if (outboundState.state === 'open') {
      return outboundState
    }
    return inboundTransport.getTransportState() ?? outboundState
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
    async openTransport(openOptions) {
      await ensureHostStarted()
      return outboundTransport.open(openOptions)
    },
    async closeTransport(closeOptions = {}) {
      const target = closeOptions.target
      if (!target) {
        await outboundTransport.close(closeOptions)
        await inboundTransport.closeTransport()
        return {
          success: true,
          target: undefined,
          transport: 'tcp'
        }
      }
      const outboundState = await outboundTransport.getState()
      if (outboundState.deviceId === target) {
        return outboundTransport.close(closeOptions)
      }
      await inboundTransport.closeTransport(target)
      return {
        success: true,
        target,
        transport: 'tcp'
      }
    },
    async sendMessage(sendOptions) {
      const outboundState = await outboundTransport.getState({
        target: sendOptions.target
      })
      if (outboundState.state === 'open') {
        return outboundTransport.sendMessage(sendOptions)
      }
      const sentViaInbound = await inboundTransport.sendMessage(sendOptions)
      if (!sentViaInbound) {
        throw new BridgeError(BRIDGE_ERROR_CODES.unsupportedOperation, 'Transport is not open.')
      }
      return {
        success: true,
        target: sendOptions.target,
        transport: 'tcp'
      }
    },
    async sendLanEvent(sendOptions) {
      const outboundState = await outboundTransport.getState({
        target: sendOptions.target
      })
      if (outboundState.state === 'open') {
        return outboundTransport.sendLanEvent(sendOptions)
      }
      const sentViaInbound = await inboundTransport.sendLanEvent(sendOptions)
      if (!sentViaInbound) {
        throw new BridgeError(BRIDGE_ERROR_CODES.unsupportedOperation, 'Transport is not open.')
      }
      return {
        success: true,
        target: sendOptions.target,
        transport: 'tcp'
      }
    },
    async getTransportState(getStateOptions = {}) {
      return resolveTransportState(getStateOptions)
    },
    async pullHostEvents() {
      return eventBus.drain()
    }
  }
}
