import { randomUUID } from 'node:crypto'
import { createSocket, type Socket as UdpSocket } from 'node:dgram'
import { createServer, type Server, type Socket } from 'node:net'
import { Bonjour, type Service as BonjourService } from 'bonjour-service'
import type {
  DeviceDiscoveryHostEvent,
  DeviceSessionSnapshot,
  DeviceSessionSendMessageOptions
} from '../../../../shared/protocol/types'
import {
  DEFAULT_HEARTBEAT_TIMEOUT_MS,
  DEFAULT_MDNS_SERVICE_TYPE,
  DEFAULT_TCP_PORT,
  UDP_DISCOVERY_MAGIC,
  UDP_DISCOVERY_PORT
} from '../core/constants'
import { hashDeviceId, localDisplayName } from '../core/device-identity'
import { normalizeRemoteIp } from '../core/network'
import type { HostEventBus } from '../events/host-event-bus'
import {
  LAN_APP_ID,
  LAN_PROTOCOL_VERSION,
  LengthPrefixedJsonCodec,
  type LanFrame
} from '../protocol/lan-frame.codec'

type InboundSession = {
  sessionId: string
  socket: Socket
  remote: string
  remoteDeviceId: string
  displayName?: string
  openedAt: number
  lastActiveAt: number
}

type InboundHostTransportOptions = {
  eventBus: HostEventBus
  resolveLocalDeviceUuid: () => string
  port?: number
}

export interface InboundHostTransport {
  start(): Promise<void>
  stop(): Promise<void>
  closeSession(sessionId?: string): Promise<void>
  sendMessage(options: DeviceSessionSendMessageOptions): Promise<boolean>
  getSessionState(sessionId?: string): DeviceSessionSnapshot | undefined
  heartbeatTick(): Promise<void>
}

function parseMdnsServiceType(serviceType?: string): { type: string; protocol: 'tcp' | 'udp' } {
  const normalized = (
    serviceType && serviceType.length > 0 ? serviceType : DEFAULT_MDNS_SERVICE_TYPE
  )
    .trim()
    .replace(/^\./, '')
    .replace(/\.local\.?$/, '')
  const parts = normalized.split('.').filter(Boolean)
  if (parts.length >= 2) {
    return {
      type: (parts[0] ?? '_synra').replace(/^_/, ''),
      protocol: parts[1] === '_udp' ? 'udp' : 'tcp'
    }
  }
  return { type: 'synra', protocol: 'tcp' }
}

export function createInboundHostTransport(
  options: InboundHostTransportOptions
): InboundHostTransport {
  const sessions = new Map<string, InboundSession>()
  const decoders = new WeakMap<Socket, LengthPrefixedJsonCodec>()
  let server: Server | undefined
  let responder: UdpSocket | undefined
  let bonjour: Bonjour | undefined
  let published: BonjourService | undefined

  const writeFrame = async (socket: Socket, frame: LanFrame): Promise<void> => {
    const codec = decoders.get(socket) ?? new LengthPrefixedJsonCodec()
    decoders.set(socket, codec)
    await new Promise<void>((resolve, reject) => {
      socket.write(codec.encode(frame), (error) => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
    })
  }

  const removeBySocket = (socket: Socket, reason: string) => {
    for (const [sessionId, session] of sessions.entries()) {
      if (session.socket !== socket) {
        continue
      }
      sessions.delete(sessionId)
      options.eventBus.publish({
        type: 'transport.session.closed',
        remote: session.remote,
        sessionId,
        payload: { reason },
        transport: 'tcp'
      })
    }
  }

  const handleFrame = async (socket: Socket, frame: LanFrame): Promise<void> => {
    if (frame.type === 'hello') {
      const payload =
        frame.payload && typeof frame.payload === 'object'
          ? (frame.payload as Record<string, unknown>)
          : {}
      const remoteDeviceId =
        typeof payload.sourceDeviceId === 'string' && payload.sourceDeviceId.length > 0
          ? payload.sourceDeviceId
          : (frame.sessionId ?? randomUUID())
      const sessionId = frame.sessionId ?? randomUUID()
      const normalizedIp = normalizeRemoteIp(socket.remoteAddress)
      const remote = `${normalizedIp ?? 'unknown'}:${String(socket.remotePort ?? 0)}`
      sessions.set(sessionId, {
        sessionId,
        socket,
        remote,
        remoteDeviceId: hashDeviceId(remoteDeviceId),
        displayName: typeof payload.displayName === 'string' ? payload.displayName : undefined,
        openedAt: Date.now(),
        lastActiveAt: Date.now()
      })
      await writeFrame(socket, {
        version: LAN_PROTOCOL_VERSION,
        type: 'helloAck',
        sessionId,
        timestamp: Date.now(),
        appId: LAN_APP_ID,
        protocolVersion: LAN_PROTOCOL_VERSION,
        capabilities: ['message'],
        payload: {
          sourceDeviceId: options.resolveLocalDeviceUuid(),
          sourceHostIp: normalizeRemoteIp(socket.localAddress),
          displayName: localDisplayName()
        }
      })
      options.eventBus.publish({
        type: 'transport.session.opened',
        remote,
        sessionId,
        payload: {
          direction: 'inbound',
          deviceId: hashDeviceId(remoteDeviceId),
          displayName: typeof payload.displayName === 'string' ? payload.displayName : undefined
        },
        transport: 'tcp'
      })
      return
    }

    if (!frame.sessionId) {
      return
    }
    const session = sessions.get(frame.sessionId)
    if (!session) {
      return
    }
    session.lastActiveAt = Date.now()

    if (frame.type === 'heartbeat') {
      await writeFrame(session.socket, {
        version: LAN_PROTOCOL_VERSION,
        type: 'heartbeat',
        sessionId: session.sessionId,
        timestamp: Date.now()
      }).catch(() => undefined)
      return
    }
    if (frame.type === 'message') {
      await writeFrame(session.socket, {
        version: LAN_PROTOCOL_VERSION,
        type: 'ack',
        sessionId: session.sessionId,
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
        remote: session.remote,
        sessionId: session.sessionId,
        messageId: frame.messageId,
        messageType,
        payload: frame.payload,
        transport: 'tcp'
      })
      return
    }
    if (frame.type === 'close') {
      sessions.delete(session.sessionId)
      session.socket.destroy()
      options.eventBus.publish({
        type: 'transport.session.closed',
        remote: session.remote,
        sessionId: session.sessionId,
        payload: { reason: 'REMOTE_CLOSED' },
        transport: 'tcp'
      })
      return
    }
    if (frame.type === 'ack' && frame.messageId) {
      options.eventBus.publish({
        type: 'transport.message.ack',
        remote: session.remote,
        sessionId: session.sessionId,
        messageId: frame.messageId,
        transport: 'tcp'
      })
    }
  }

  const startTcpServer = async (): Promise<void> => {
    if (server) {
      return
    }
    server = createServer((socket) => {
      const codec = new LengthPrefixedJsonCodec()
      decoders.set(socket, codec)
      socket.on('data', (chunk) => {
        if (!Buffer.isBuffer(chunk)) {
          return
        }
        for (const frame of codec.decodeChunk(chunk)) {
          void handleFrame(socket, frame).catch((error: unknown) => {
            options.eventBus.publish({
              type: 'transport.error',
              remote: `${normalizeRemoteIp(socket.remoteAddress) ?? 'unknown'}:${String(socket.remotePort ?? 0)}`,
              code: 'INBOUND_FRAME_ERROR',
              payload: { message: error instanceof Error ? error.message : 'INBOUND_FRAME_ERROR' },
              transport: 'tcp'
            })
          })
        }
      })
      socket.on('error', (error) => {
        options.eventBus.publish({
          type: 'transport.error',
          remote: `${normalizeRemoteIp(socket.remoteAddress) ?? 'unknown'}:${String(socket.remotePort ?? 0)}`,
          code: 'INBOUND_SOCKET_ERROR',
          payload: { message: error.message },
          transport: 'tcp'
        })
      })
      socket.on('close', () => {
        removeBySocket(socket, 'SOCKET_CLOSED')
      })
    })

    await new Promise<void>((resolve, reject) => {
      server?.once('error', reject)
      server?.listen(options.port ?? DEFAULT_TCP_PORT, () => resolve())
    })
  }

  const startUdpResponder = async (): Promise<void> => {
    if (responder) {
      return
    }
    responder = createSocket('udp4')
    responder.on('message', (buffer, remote) => {
      const text = buffer.toString('utf8').trim()
      if (!text.startsWith(UDP_DISCOVERY_MAGIC)) {
        return
      }
      const payload = Buffer.from(
        `${UDP_DISCOVERY_MAGIC} ${JSON.stringify({
          appId: LAN_APP_ID,
          sourceDeviceId: options.resolveLocalDeviceUuid(),
          protocolVersion: LAN_PROTOCOL_VERSION,
          displayName: localDisplayName()
        })}`,
        'utf8'
      )
      responder?.send(payload, remote.port, remote.address)
    })
    await new Promise<void>((resolve, reject) => {
      responder?.once('error', reject)
      responder?.bind(UDP_DISCOVERY_PORT, () => resolve())
    })
  }

  const startBonjour = (): void => {
    if (bonjour || !server) {
      return
    }
    bonjour = new Bonjour()
    const serviceType = parseMdnsServiceType(undefined)
    published = bonjour.publish({
      name: `synra-${localDisplayName()}`,
      type: serviceType.type,
      protocol: serviceType.protocol,
      port: Number((server.address() as { port: number }).port),
      txt: {
        appId: LAN_APP_ID,
        sourceDeviceId: options.resolveLocalDeviceUuid(),
        protocolVersion: LAN_PROTOCOL_VERSION,
        displayName: localDisplayName()
      }
    })
  }

  const closeSessions = async (sessionId?: string): Promise<void> => {
    const targetIds = sessionId ? [sessionId] : [...sessions.keys()]
    for (const targetId of targetIds) {
      const session = sessions.get(targetId)
      if (!session) {
        continue
      }
      await writeFrame(session.socket, {
        version: LAN_PROTOCOL_VERSION,
        type: 'close',
        sessionId: targetId,
        timestamp: Date.now()
      }).catch(() => undefined)
      session.socket.destroy()
      sessions.delete(targetId)
    }
  }

  return {
    async start() {
      await startTcpServer()
      await startUdpResponder()
      startBonjour()
    },
    async stop() {
      for (const session of sessions.values()) {
        session.socket.destroy()
      }
      sessions.clear()
      published?.stop?.()
      bonjour?.destroy()
      bonjour = undefined
      published = undefined
      if (responder) {
        responder.close()
        responder = undefined
      }
      if (server) {
        await new Promise<void>((resolve) => {
          server?.close(() => resolve())
        })
        server = undefined
      }
    },
    async closeSession(sessionId) {
      await closeSessions(sessionId)
    },
    async sendMessage(sendOptions) {
      const session = sessions.get(sendOptions.sessionId)
      if (!session || session.socket.destroyed) {
        return false
      }
      await writeFrame(session.socket, {
        version: LAN_PROTOCOL_VERSION,
        type: 'message',
        sessionId: sendOptions.sessionId,
        messageId: sendOptions.messageId ?? randomUUID(),
        timestamp: Date.now(),
        payload: {
          messageType: sendOptions.messageType,
          payload: sendOptions.payload
        }
      })
      return true
    },
    getSessionState(sessionId) {
      if (sessionId) {
        const target = sessions.get(sessionId)
        if (!target) {
          return undefined
        }
        return {
          sessionId: target.sessionId,
          deviceId: target.remoteDeviceId,
          state: 'open',
          direction: 'inbound',
          openedAt: target.openedAt,
          transport: 'tcp'
        }
      }
      const first = sessions.values().next().value as InboundSession | undefined
      if (!first) {
        return undefined
      }
      return {
        sessionId: first.sessionId,
        deviceId: first.remoteDeviceId,
        state: 'open',
        direction: 'inbound',
        openedAt: first.openedAt,
        transport: 'tcp'
      }
    },
    async heartbeatTick() {
      const now = Date.now()
      for (const [sessionId, session] of sessions.entries()) {
        if (now - session.lastActiveAt <= DEFAULT_HEARTBEAT_TIMEOUT_MS) {
          continue
        }
        options.eventBus.publish({
          type: 'host.heartbeat.timeout',
          remote: session.remote,
          sessionId,
          code: 'INBOUND_HEARTBEAT_TIMEOUT',
          transport: 'tcp'
        })
        await closeSessions(sessionId)
      }
    }
  }
}
