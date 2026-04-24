import { randomUUID } from 'node:crypto'
import { Socket } from 'node:net'
import { BridgeError } from '../../../../shared/errors/bridge-error'
import { BRIDGE_ERROR_CODES } from '../../../../shared/errors/codes'
import type {
  DeviceDiscoveryHostEvent,
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
import { localDisplayName } from '../core/device-identity'
import { pickPrimarySourceHostIp } from '../core/network'
import type { HostEventBus } from '../events/host-event-bus'
import type { ProbeSocketRegistry } from '../discovery/probe-socket-registry'
import {
  LAN_APP_ID,
  LAN_PROTOCOL_VERSION,
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

type OutboundClientSessionOptions = {
  eventBus: HostEventBus
  resolveLocalDeviceUuid: () => string
  probeSocketRegistry?: ProbeSocketRegistry
}

export interface OutboundClientSession {
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

export function createOutboundClientSession(
  options: OutboundClientSessionOptions
): OutboundClientSession {
  let codec: LengthPrefixedJsonCodec = new LengthPrefixedJsonCodec()
  const pendingAcks = new Map<string, () => void>()
  let socket: Socket | undefined
  let state: OutboundState = { state: 'idle' }
  let lastHeartbeatAt = 0
  let resolveConnect: ((result: ConnectAckResult) => void) | undefined
  let rejectConnect: ((reason: unknown) => void) | undefined

  const closeWithError = (reason?: string) => {
    if (socket) {
      socket.destroy()
      socket = undefined
    }
    codec.reset()
    state = {
      ...state,
      state: 'closed',
      closedAt: Date.now(),
      lastError: reason
    }
  }

  const publishTransportError = (code: string, payload: unknown) => {
    options.eventBus.publish({
      type: 'transport.error',
      remote: `${state.host ?? ''}:${String(state.port ?? '')}`,
      deviceId: state.deviceId,
      code,
      payload,
      transport: 'tcp'
    })
  }

  const writeFrame = async (frame: LanFrame): Promise<void> => {
    const currentSocket = socket
    if (!currentSocket || currentSocket.destroyed) {
      throw new BridgeError(BRIDGE_ERROR_CODES.unsupportedOperation, 'Session is not open.')
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

  const handleFrame = (frame: LanFrame) => {
    if (
      frame.type === 'connectAck' &&
      resolveConnect &&
      frame.requestId &&
      frame.appId === LAN_APP_ID
    ) {
      const payload =
        frame.payload && typeof frame.payload === 'object'
          ? (frame.payload as Record<string, unknown>)
          : {}
      const displayName =
        typeof payload.displayName === 'string' && payload.displayName.length > 0
          ? payload.displayName
          : undefined
      const remoteDeviceId =
        typeof payload.sourceDeviceId === 'string' && payload.sourceDeviceId.length > 0
          ? payload.sourceDeviceId
          : undefined
      resolveConnect({
        displayName,
        remoteDeviceId
      })
      resolveConnect = undefined
      rejectConnect = undefined
      return
    }
    if (frame.type === 'ack' && frame.targetDeviceId && frame.messageId) {
      const key = `${frame.targetDeviceId}:${frame.messageId}`
      const resolve = pendingAcks.get(key)
      pendingAcks.delete(key)
      resolve?.()
      options.eventBus.publish({
        type: 'transport.message.ack',
        remote: `${state.host ?? ''}:${String(state.port ?? '')}`,
        deviceId: frame.targetDeviceId,
        messageId: frame.messageId,
        payload: {
          requestId: frame.requestId,
          targetDeviceId: frame.targetDeviceId
        },
        transport: 'tcp'
      })
      return
    }
    if (frame.type === 'message' && frame.requestId) {
      void writeFrame({
        version: LAN_PROTOCOL_VERSION,
        type: 'ack',
        requestId: frame.requestId,
        targetDeviceId: state.deviceId,
        messageId: frame.messageId,
        timestamp: Date.now()
      }).catch(() => undefined)
      const payload = frame.payload
      const messageType =
        payload && typeof payload === 'object' && 'messageType' in payload
          ? ((payload as { messageType?: string })
              .messageType as DeviceDiscoveryHostEvent['messageType'])
          : undefined
      options.eventBus.publish({
        type: 'transport.message.received',
        remote: `${state.host ?? ''}:${String(state.port ?? '')}`,
        deviceId: state.deviceId,
        messageId: frame.messageId,
        messageType,
        payload: frame.payload,
        transport: 'tcp'
      })
      return
    }
    if (frame.type === 'event' && frame.requestId) {
      const pl =
        frame.payload && typeof frame.payload === 'object'
          ? (frame.payload as Record<string, unknown>)
          : {}
      const eventName = typeof pl.eventName === 'string' ? pl.eventName : ''
      options.eventBus.publish({
        type: 'transport.lan.event.received',
        remote: `${state.host ?? ''}:${String(state.port ?? '')}`,
        deviceId: state.deviceId,
        payload: {
          requestId: frame.requestId,
          sourceDeviceId: frame.sourceDeviceId,
          targetDeviceId: frame.targetDeviceId,
          replyToRequestId: frame.replyToRequestId,
          eventName,
          eventPayload: pl.payload,
          fromDeviceId: state.deviceId
        },
        transport: 'tcp'
      })
      return
    }
    if (frame.type === 'heartbeat') {
      lastHeartbeatAt = Date.now()
      return
    }
    if (frame.type === 'hostRetire' || frame.type === 'memberOffline') {
      options.eventBus.publish({
        type: frame.type === 'hostRetire' ? 'host.retire' : 'host.member.offline',
        remote: `${state.host ?? ''}:${String(state.port ?? '')}`,
        deviceId: state.deviceId,
        payload: frame.payload,
        transport: 'tcp'
      })
      return
    }
    if (frame.type === 'close') {
      closeWithError('REMOTE_CLOSED')
      options.eventBus.publish({
        type: 'transport.closed',
        remote: `${state.host ?? ''}:${String(state.port ?? '')}`,
        deviceId: state.deviceId,
        payload: { reason: 'REMOTE_CLOSED' },
        transport: 'tcp'
      })
    }
  }

  const attachSocketHandlers = (currentSocket: Socket) => {
    currentSocket.on('data', (chunk) => {
      if (!Buffer.isBuffer(chunk)) {
        return
      }
      for (const frame of codec.decodeChunk(chunk)) {
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
          'Session is already connecting.'
        )
      }
      const adoptKey = `${openOptions.host}:${openOptions.port}`
      const lease = options.probeSocketRegistry?.take(adoptKey)
      if (lease) {
        closeWithError('SESSION_REPLACED')
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
        attachSocketHandlers(socket)
        options.eventBus.publish({
          type: 'transport.opened',
          remote: `${openOptions.host}:${String(openOptions.port)}`,
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

      closeWithError('SESSION_REPLACED')

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
      const connectAck = await new Promise<ConnectAckResult>((resolve, reject) => {
        resolveConnect = resolve
        rejectConnect = reject
        const timeout = setTimeout(() => reject('SESSION_OPEN_TIMEOUT'), DEFAULT_ACK_TIMEOUT_MS)
        socket?.connect(openOptions.port, openOptions.host, () => {
          const payload: Record<string, unknown> = {
            token: openOptions.token,
            sourceDeviceId: options.resolveLocalDeviceUuid(),
            probe: false,
            displayName: localDisplayName(),
            connectType: openOptions.connectType
          }
          const sourceHostIp = pickPrimarySourceHostIp()
          if (sourceHostIp) {
            payload.sourceHostIp = sourceHostIp
          }
          const connect: LanFrame = {
            version: LAN_PROTOCOL_VERSION,
            type: 'connect',
            requestId: randomUUID(),
            sourceDeviceId: options.resolveLocalDeviceUuid(),
            targetDeviceId: openOptions.deviceId,
            timestamp: Date.now(),
            appId: LAN_APP_ID,
            protocolVersion: LAN_PROTOCOL_VERSION,
            capabilities: ['message', 'event'],
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
              : 'SESSION_OPEN_FAILED'
        closeWithError(reasonText)
        throw new BridgeError(
          BRIDGE_ERROR_CODES.timeout,
          `Failed to open discovery session. reason=${reasonText}`,
          {
            reason: reasonText
          }
        )
      })

      const now = Date.now()
      lastHeartbeatAt = now
      state = {
        ...state,
        state: 'open',
        remoteDisplayName: connectAck.displayName,
        openedAt: now
      }
      options.eventBus.publish({
        type: 'transport.opened',
        remote: `${openOptions.host}:${String(openOptions.port)}`,
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
      const targetDeviceId = closeOptions.targetDeviceId ?? state.deviceId
      if (state.state === 'open' && targetDeviceId) {
        await writeFrame({
          version: LAN_PROTOCOL_VERSION,
          type: 'close',
          requestId: randomUUID(),
          sourceDeviceId: options.resolveLocalDeviceUuid(),
          targetDeviceId,
          timestamp: Date.now()
        }).catch(() => undefined)
      }
      closeWithError('SESSION_CLOSED_BY_CLIENT')
      return {
        success: true,
        targetDeviceId,
        transport: 'tcp'
      }
    },
    async sendLanEvent(sendOptions) {
      if (state.state !== 'open' || !state.deviceId) {
        throw new BridgeError(BRIDGE_ERROR_CODES.unsupportedOperation, 'Session is not open.')
      }
      const envelope: Record<string, unknown> = {
        eventName: sendOptions.eventName,
        payload: sendOptions.payload
      }
      if (sendOptions.eventId !== undefined) {
        envelope.eventId = sendOptions.eventId
      }
      if (sendOptions.schemaVersion !== undefined) {
        envelope.schemaVersion = sendOptions.schemaVersion
      }
      await writeFrame({
        version: LAN_PROTOCOL_VERSION,
        type: 'event',
        requestId: sendOptions.requestId,
        sourceDeviceId: sendOptions.sourceDeviceId,
        targetDeviceId: sendOptions.targetDeviceId,
        replyToRequestId: sendOptions.replyToRequestId,
        timestamp: Date.now(),
        payload: envelope
      })
      return {
        success: true,
        targetDeviceId: sendOptions.targetDeviceId,
        transport: 'tcp'
      }
    },
    async sendMessage(sendOptions) {
      if (state.state !== 'open' || !state.deviceId) {
        throw new BridgeError(BRIDGE_ERROR_CODES.unsupportedOperation, 'Session is not open.')
      }
      const messageId = sendOptions.messageId ?? randomUUID()
      const key = `${sendOptions.targetDeviceId}:${messageId}`
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
          version: LAN_PROTOCOL_VERSION,
          type: 'message',
          requestId: sendOptions.requestId,
          sourceDeviceId: sendOptions.sourceDeviceId,
          targetDeviceId: sendOptions.targetDeviceId,
          replyToRequestId: sendOptions.replyToRequestId,
          messageId,
          timestamp: Date.now(),
          payload: {
            messageType: sendOptions.messageType,
            payload: sendOptions.payload
          }
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
        messageId,
        targetDeviceId: sendOptions.targetDeviceId,
        transport: 'tcp'
      }
    },
    async getState(getOptions = {}) {
      if (getOptions.targetDeviceId && getOptions.targetDeviceId !== state.deviceId) {
        return {
          state: 'closed',
          deviceId: getOptions.targetDeviceId,
          closedAt: Date.now(),
          lastError: 'SESSION_NOT_FOUND',
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
      if (state.state !== 'open' || !state.deviceId) {
        return
      }
      if (Date.now() - lastHeartbeatAt > DEFAULT_HEARTBEAT_TIMEOUT_MS) {
        options.eventBus.publish({
          type: 'host.heartbeat.timeout',
          remote: `${state.host ?? ''}:${String(state.port ?? '')}`,
          deviceId: state.deviceId,
          code: 'REMOTE_HEARTBEAT_TIMEOUT',
          transport: 'tcp'
        })
        closeWithError('REMOTE_HEARTBEAT_TIMEOUT')
        return
      }
      await writeFrame({
        version: LAN_PROTOCOL_VERSION,
        type: 'heartbeat',
        requestId: randomUUID(),
        sourceDeviceId: options.resolveLocalDeviceUuid(),
        targetDeviceId: state.deviceId,
        timestamp: Date.now()
      }).catch(() => undefined)
    }
  }
}
