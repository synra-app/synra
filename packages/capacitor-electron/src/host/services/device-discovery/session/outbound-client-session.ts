import { randomUUID } from 'node:crypto'
import { Socket } from 'node:net'
import { isLanWireEventName } from '@synra/protocol'
import { BridgeError } from '../../../../shared/errors/bridge-error'
import { BRIDGE_ERROR_CODES } from '../../../../shared/errors/codes'
import type {
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
} from '../../../../shared/protocol/types'
import { DEFAULT_ACK_TIMEOUT_MS, DEFAULT_HEARTBEAT_TIMEOUT_MS } from '../core/constants'
import { hashDeviceId, localDisplayName } from '../core/device-identity'
import { pickPrimarySourceHostIp } from '../core/network'
import type { HostEventBus } from '../events/host-event-bus'
import type { ProbeSocketRegistry } from '../discovery/probe-socket-registry'
import {
  DEVICE_HOST_RETIRE_EVENT,
  DEVICE_MEMBER_OFFLINE_EVENT,
  DEVICE_TCP_ACK_EVENT,
  DEVICE_TCP_CLOSE_EVENT,
  DEVICE_TCP_CONNECT_ACK_EVENT,
  DEVICE_TCP_CONNECT_EVENT,
  DEVICE_TCP_HEARTBEAT_EVENT,
  LengthPrefixedJsonCodec,
  type LanFrame
} from '../protocol/lan-frame.codec'

type OutboundState = {
  deviceId?: string
  remoteDisplayName?: string
  host?: string
  port?: number
  state: DeviceTransportSnapshot['state']
  openedAt?: number
  closedAt?: number
  lastError?: string
}

function buildDeviceAliases(deviceId: string | undefined): Set<string> {
  const aliases = new Set<string>()
  if (!deviceId || deviceId.trim().length === 0) {
    return aliases
  }
  const normalized = deviceId.trim()
  aliases.add(normalized)
  aliases.add(hashDeviceId(normalized))
  return aliases
}

type OutboundClientTransportOptions = {
  eventBus: HostEventBus
  resolveLocalDeviceUuid: () => string
  probeSocketRegistry?: ProbeSocketRegistry
}

export interface OutboundClientTransport {
  open(options: DeviceTransportOpenOptions): Promise<DeviceTransportOpenResult>
  close(options?: DeviceTransportCloseOptions): Promise<DeviceTransportCloseResult>
  sendMessage(options: DeviceTransportSendMessageOptions): Promise<DeviceTransportSendMessageResult>
  sendLanEvent(
    options: DeviceTransportSendLanEventOptions
  ): Promise<DeviceTransportSendLanEventResult>
  getState(options?: DeviceTransportGetStateOptions): Promise<DeviceTransportSnapshot>
  heartbeatTick(): Promise<void>
}

type ConnectAckResult = {
  displayName?: string
  remoteDeviceId?: string
}

export function createOutboundClientTransport(
  options: OutboundClientTransportOptions
): OutboundClientTransport {
  let codec: LengthPrefixedJsonCodec = new LengthPrefixedJsonCodec()
  const pendingAcks = new Map<string, () => void>()
  let socket: Socket | undefined
  let state: OutboundState = { state: 'idle' }
  let remoteDeviceAliases = new Set<string>()
  let lastHeartbeatAt = 0
  let resolveConnect: ((result: ConnectAckResult) => void) | undefined
  let rejectConnect: ((reason: unknown) => void) | undefined

  const closeWithError = (reason?: string) => {
    if (socket) {
      socket.destroy()
      socket = undefined
    }
    codec.reset()
    remoteDeviceAliases = new Set<string>()
    state = {
      ...state,
      state: 'closed',
      closedAt: Date.now(),
      lastError: reason
    }
  }

  const canRouteToTargetDevice = (targetDeviceId: string | undefined): boolean => {
    if (!targetDeviceId || targetDeviceId.trim().length === 0) {
      return true
    }
    const normalized = targetDeviceId.trim()
    if (remoteDeviceAliases.has(normalized)) {
      return true
    }
    return remoteDeviceAliases.has(hashDeviceId(normalized))
  }

  const publishTransportError = (code: string, payload: unknown) => {
    options.eventBus.publish({
      type: 'transport.error',
      deviceId: state.deviceId,
      code,
      payload,
      transport: 'tcp'
    })
  }

  // SYNRA-COMM::TCP::SEND::FRAME_WRITE
  const writeFrame = async (frame: LanFrame): Promise<void> => {
    const currentSocket = socket
    if (!currentSocket || currentSocket.destroyed) {
      throw new BridgeError(BRIDGE_ERROR_CODES.unsupportedOperation, 'Transport is not open.')
    }
    await new Promise<void>((resolve, reject) => {
      currentSocket.write(codec.encode(frame), (error) => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
    })
  }

  const isControlEvent = (event: string): boolean =>
    event === DEVICE_TCP_CONNECT_EVENT ||
    event === DEVICE_TCP_CONNECT_ACK_EVENT ||
    event === DEVICE_TCP_ACK_EVENT ||
    event === DEVICE_TCP_CLOSE_EVENT ||
    event === DEVICE_TCP_HEARTBEAT_EVENT ||
    event === DEVICE_HOST_RETIRE_EVENT ||
    event === DEVICE_MEMBER_OFFLINE_EVENT

  // SYNRA-COMM::TCP::RECEIVE::OUTBOUND_RECV_LOOP
  const handleFrame = (frame: LanFrame) => {
    if (frame.event === DEVICE_TCP_CONNECT_ACK_EVENT && resolveConnect && frame.requestId) {
      const payload =
        frame.payload && typeof frame.payload === 'object'
          ? (frame.payload as Record<string, unknown>)
          : {}
      const displayName =
        typeof payload.displayName === 'string' && payload.displayName.length > 0
          ? payload.displayName
          : undefined
      const remoteDeviceId =
        typeof payload.from === 'string' && payload.from.length > 0 ? payload.from : undefined
      resolveConnect({
        displayName,
        remoteDeviceId
      })
      resolveConnect = undefined
      rejectConnect = undefined
      return
    }
    if (frame.event === DEVICE_TCP_ACK_EVENT && frame.target && frame.replyRequestId) {
      const key = `${frame.target}:${frame.replyRequestId}`
      const resolve = pendingAcks.get(key)
      pendingAcks.delete(key)
      resolve?.()
      options.eventBus.publish({
        type: 'transport.message.ack',
        deviceId: frame.target,
        event: frame.event,
        target: frame.target,
        from: frame.from,
        replyRequestId: frame.replyRequestId,
        payload: {
          requestId: frame.requestId
        },
        transport: 'tcp'
      })
      return
    }
    // SYNRA-COMM::TCP::ACK::MESSAGE_ACK_AUTO
    if (!isControlEvent(frame.event) && frame.requestId) {
      const ackTarget =
        typeof frame.target === 'string' && frame.target.length > 0 ? frame.target : state.deviceId
      if (!ackTarget || ackTarget.length === 0) {
        return
      }
      void writeFrame({
        requestId: randomUUID(),
        event: DEVICE_TCP_ACK_EVENT,
        target: ackTarget,
        from: options.resolveLocalDeviceUuid(),
        replyRequestId: frame.requestId,
        timestamp: Date.now()
      }).catch(() => undefined)
      const envelopePayload = {
        requestId: frame.requestId,
        event: frame.event,
        from: frame.from,
        target: frame.target,
        replyRequestId: frame.replyRequestId,
        payload: frame.payload
      }
      // SYNRA-COMM::MESSAGE_ENVELOPE::RECEIVE::LAN_EVENT_ROUTE
      options.eventBus.publish({
        type:
          typeof frame.event === 'string' && isLanWireEventName(frame.event)
            ? 'transport.lan.event.received'
            : 'transport.message.received',
        deviceId: state.deviceId,
        event: frame.event,
        target: frame.target,
        from: frame.from,
        replyRequestId: frame.replyRequestId,
        payload: envelopePayload,
        transport: 'tcp'
      })
      return
    }
    if (frame.event === DEVICE_TCP_HEARTBEAT_EVENT) {
      lastHeartbeatAt = Date.now()
      return
    }
    if (frame.event === DEVICE_HOST_RETIRE_EVENT || frame.event === DEVICE_MEMBER_OFFLINE_EVENT) {
      options.eventBus.publish({
        type: frame.event === DEVICE_HOST_RETIRE_EVENT ? 'host.retire' : 'host.member.offline',
        deviceId: state.deviceId,
        payload: frame.payload,
        transport: 'tcp'
      })
      return
    }
    if (frame.event === DEVICE_TCP_CLOSE_EVENT) {
      closeWithError('REMOTE_CLOSED')
      options.eventBus.publish({
        type: 'transport.closed',
        deviceId: state.deviceId,
        payload: { reason: 'REMOTE_CLOSED' },
        transport: 'tcp'
      })
    }
  }

  // SYNRA-COMM::TCP::RECEIVE::OUTBOUND_SOCKET_BINDINGS
  const attachSocketHandlers = (currentSocket: Socket) => {
    currentSocket.on('data', (chunk) => {
      if (!Buffer.isBuffer(chunk)) {
        return
      }
      for (const frame of codec.decodeChunk(chunk)) {
        console.info('[tcp-message-recv]', {
          deviceId: state.deviceId,
          event: frame.event,
          requestId: frame.requestId,
          from: frame.from,
          target: frame.target,
          replyRequestId: frame.replyRequestId,
          timestamp: frame.timestamp
        })
        handleFrame(frame)
      }
    })
    currentSocket.on('error', (error) => {
      rejectConnect?.(error)
      rejectConnect = undefined
      resolveConnect = undefined
      publishTransportError('SOCKET_ERROR', { message: error.message })
      closeWithError(error.message)
    })
    currentSocket.on('close', () => {
      if (state.state === 'connecting') {
        rejectConnect?.('SOCKET_CLOSED')
        rejectConnect = undefined
        resolveConnect = undefined
      }
      if (state.state !== 'closed') {
        closeWithError('SOCKET_CLOSED')
      }
    })
  }

  return {
    async open(openOptions) {
      if (state.state === 'connecting') {
        throw new BridgeError(
          BRIDGE_ERROR_CODES.unsupportedOperation,
          'Transport is already connecting.'
        )
      }
      const adoptKey = `${openOptions.host}:${openOptions.port}`
      const lease = options.probeSocketRegistry?.take(adoptKey)
      if (lease) {
        closeWithError('TRANSPORT_REPLACED')
        socket = lease.socket
        codec = lease.codec
        const now = Date.now()
        lastHeartbeatAt = now
        state = {
          deviceId: openOptions.deviceId,
          host: openOptions.host,
          port: openOptions.port,
          state: 'open',
          remoteDisplayName: lease.displayName,
          openedAt: now,
          closedAt: undefined,
          lastError: undefined
        }
        remoteDeviceAliases = buildDeviceAliases(openOptions.deviceId)
        attachSocketHandlers(socket)
        options.eventBus.publish({
          type: 'transport.opened',
          deviceId: openOptions.deviceId,
          payload: {
            direction: 'outbound',
            deviceId: openOptions.deviceId,
            host: openOptions.host,
            port: openOptions.port,
            displayName: lease.displayName
          },
          transport: 'tcp'
        })
        return {
          success: true,
          deviceId: openOptions.deviceId,
          state: 'open',
          transport: 'tcp'
        }
      }

      closeWithError('TRANSPORT_REPLACED')

      socket = new Socket()
      codec = new LengthPrefixedJsonCodec()
      state = {
        deviceId: openOptions.deviceId,
        host: openOptions.host,
        port: openOptions.port,
        state: 'connecting',
        openedAt: undefined,
        closedAt: undefined,
        lastError: undefined
      }
      attachSocketHandlers(socket)
      // SYNRA-COMM::DEVICE_HANDSHAKE::CONNECT::OPEN_TRANSPORT
      const connectAck = await new Promise<ConnectAckResult>((resolve, reject) => {
        resolveConnect = resolve
        rejectConnect = reject
        const timeout = setTimeout(() => reject('TRANSPORT_OPEN_TIMEOUT'), DEFAULT_ACK_TIMEOUT_MS)
        socket?.connect(openOptions.port, openOptions.host, () => {
          const payload: Record<string, unknown> = {
            appId: 'synra',
            token: openOptions.token,
            from: options.resolveLocalDeviceUuid(),
            probe: false,
            displayName: localDisplayName(),
            connectType: openOptions.connectType
          }
          const sourceHostIp = pickPrimarySourceHostIp()
          if (sourceHostIp) {
            payload.sourceHostIp = sourceHostIp
          }
          const connect: LanFrame = {
            requestId: randomUUID(),
            event: DEVICE_TCP_CONNECT_EVENT,
            target: openOptions.deviceId,
            from: options.resolveLocalDeviceUuid(),
            timestamp: Date.now(),
            payload
          }
          void writeFrame(connect).catch(reject)
        })
        const currentReject = reject
        rejectConnect = (reason) => {
          clearTimeout(timeout)
          currentReject(reason)
        }
        resolveConnect = (id) => {
          clearTimeout(timeout)
          resolve(id)
        }
      }).catch((reason) => {
        const reasonText =
          typeof reason === 'string'
            ? reason
            : reason instanceof Error
              ? reason.message
              : 'TRANSPORT_OPEN_FAILED'
        closeWithError(reasonText)
        throw new BridgeError(
          BRIDGE_ERROR_CODES.timeout,
          `Failed to open discovery transport. reason=${reasonText}`,
          {
            reason: reasonText
          }
        )
      })

      const now = Date.now()
      remoteDeviceAliases = new Set<string>([
        ...buildDeviceAliases(openOptions.deviceId),
        ...buildDeviceAliases(connectAck.remoteDeviceId)
      ])
      lastHeartbeatAt = now
      state = {
        ...state,
        state: 'open',
        remoteDisplayName: connectAck.displayName,
        openedAt: now
      }
      options.eventBus.publish({
        type: 'transport.opened',
        deviceId: openOptions.deviceId,
        payload: {
          direction: 'outbound',
          deviceId: openOptions.deviceId,
          host: openOptions.host,
          port: openOptions.port,
          displayName: connectAck.displayName
        },
        transport: 'tcp'
      })
      return {
        success: true,
        deviceId: openOptions.deviceId,
        state: 'open',
        transport: 'tcp'
      }
    },
    async close(closeOptions = {}) {
      // SYNRA-COMM::TCP::CLOSE::TRANSPORT_CLOSE
      const target = closeOptions.target ?? state.deviceId
      if (state.state === 'open' && target) {
        await writeFrame({
          requestId: randomUUID(),
          event: DEVICE_TCP_CLOSE_EVENT,
          target,
          from: options.resolveLocalDeviceUuid(),
          timestamp: Date.now()
        }).catch(() => undefined)
      }
      closeWithError('TRANSPORT_CLOSED_BY_CLIENT')
      return {
        success: true,
        target,
        transport: 'tcp'
      }
    },
    async sendLanEvent(sendOptions) {
      // SYNRA-COMM::TCP::SEND::LAN_EVENT_SEND
      if (state.state !== 'open' || !state.deviceId) {
        throw new BridgeError(BRIDGE_ERROR_CODES.unsupportedOperation, 'Transport is not open.')
      }
      await writeFrame({
        requestId: sendOptions.requestId,
        event: sendOptions.event,
        from: sendOptions.from,
        target: sendOptions.target,
        replyRequestId: sendOptions.replyRequestId,
        timestamp: sendOptions.timestamp ?? Date.now(),
        payload: sendOptions.payload
      })
      return {
        success: true,
        target: sendOptions.target,
        transport: 'tcp'
      }
    },
    async sendMessage(sendOptions) {
      // SYNRA-COMM::TCP::SEND::MESSAGE_SEND
      if (state.state !== 'open' || !state.deviceId) {
        throw new BridgeError(BRIDGE_ERROR_CODES.unsupportedOperation, 'Transport is not open.')
      }
      const key = `${sendOptions.target}:${sendOptions.requestId}`
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          pendingAcks.delete(key)
          reject(new Error('MESSAGE_ACK_TIMEOUT'))
        }, DEFAULT_ACK_TIMEOUT_MS)
        pendingAcks.set(key, () => {
          clearTimeout(timer)
          resolve()
        })
        void writeFrame({
          requestId: sendOptions.requestId,
          event: sendOptions.event,
          from: sendOptions.from,
          target: sendOptions.target,
          replyRequestId: sendOptions.replyRequestId,
          timestamp: sendOptions.timestamp ?? Date.now(),
          payload: sendOptions.payload
        }).catch((error) => {
          clearTimeout(timer)
          pendingAcks.delete(key)
          reject(error)
        })
      }).catch((error) => {
        throw new BridgeError(BRIDGE_ERROR_CODES.timeout, 'Failed to receive message ack.', {
          reason: error instanceof Error ? error.message : 'MESSAGE_ACK_TIMEOUT'
        })
      })
      return {
        success: true,
        target: sendOptions.target,
        transport: 'tcp'
      }
    },
    async getState(getOptions = {}) {
      if (getOptions.target && !canRouteToTargetDevice(getOptions.target)) {
        return {
          state: 'closed',
          deviceId: getOptions.target,
          closedAt: Date.now(),
          lastError: 'TRANSPORT_NOT_FOUND',
          direction: 'outbound',
          transport: 'tcp'
        }
      }
      return {
        ...state,
        direction: 'outbound',
        transport: 'tcp'
      }
    },
    async heartbeatTick() {
      // SYNRA-COMM::TCP::HEARTBEAT::TRANSPORT_HEARTBEAT
      if (state.state !== 'open' || !state.deviceId) {
        return
      }
      if (Date.now() - lastHeartbeatAt > DEFAULT_HEARTBEAT_TIMEOUT_MS) {
        options.eventBus.publish({
          type: 'host.heartbeat.timeout',
          deviceId: state.deviceId,
          code: 'REMOTE_HEARTBEAT_TIMEOUT',
          transport: 'tcp'
        })
        closeWithError('REMOTE_HEARTBEAT_TIMEOUT')
        return
      }
      await writeFrame({
        requestId: randomUUID(),
        event: DEVICE_TCP_HEARTBEAT_EVENT,
        from: options.resolveLocalDeviceUuid(),
        target: state.deviceId,
        timestamp: Date.now()
      }).catch(() => undefined)
    }
  }
}
