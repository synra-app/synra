import { randomUUID } from 'node:crypto'
import { createSocket, type Socket as UdpSocket } from 'node:dgram'
import { createServer, type Server, type Socket } from 'node:net'
import { networkInterfaces } from 'node:os'
import { Bonjour, type Service as BonjourService } from 'bonjour-service'
import { isLanWireEventName } from '@synra/protocol'
import type {
  DeviceTransportSendLanEventOptions,
  DeviceTransportSnapshot,
  DeviceTransportSendMessageOptions
} from '../../../../shared/protocol/types'
import {
  DEFAULT_HEARTBEAT_TIMEOUT_MS,
  DEFAULT_MDNS_SERVICE_TYPE,
  DEFAULT_TCP_PORT,
  UDP_DISCOVERY_MAGIC,
  UDP_DISCOVERY_PORT
} from '../core/constants'
import { isWirePeerInMainPairedList, localDisplayName } from '../core/device-identity'
import { normalizeRemoteIp, peerAddressFromSocket, pickPrimarySourceHostIp } from '../core/network'
import type { HostEventBus } from '../events/host-event-bus'
import {
  DEVICE_HOST_RETIRE_EVENT,
  DEVICE_MEMBER_OFFLINE_EVENT,
  DEVICE_TCP_ACK_EVENT,
  DEVICE_TCP_CLOSE_EVENT,
  DEVICE_TCP_CONNECT_ACK_EVENT,
  DEVICE_TCP_CONNECT_EVENT,
  DEVICE_TCP_ERROR_EVENT,
  DEVICE_TCP_HEARTBEAT_EVENT,
  LengthPrefixedJsonCodec,
  type LanFrame
} from '../protocol/lan-frame.codec'

/** One accepted inbound TCP connection; LAN frames on this socket carry their own `requestId`. */
type InboundTcpLink = {
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
  enableUdpResponder?: boolean
  enableBonjour?: boolean
}

const UDP_OFFLINE_ANNOUNCEMENT_TYPE = 'offline'
const DISCOVERY_APP_ID = 'synra'
const DISCOVERY_PROTOCOL_VERSION = '1.0'

export interface InboundHostTransport {
  start(): Promise<void>
  stop(): Promise<void>
  closeTransport(deviceId?: string): Promise<void>
  sendMessage(options: DeviceTransportSendMessageOptions): Promise<boolean>
  sendLanEvent(options: DeviceTransportSendLanEventOptions): Promise<boolean>
  getTransportState(deviceId?: string): DeviceTransportSnapshot | undefined
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

/** Resolve API / frame peer id to an open inbound link key (UUID identity). */
function resolvePeerWireIdKey(links: Map<string, InboundTcpLink>, id: string): string | undefined {
  const trimmed = id.trim()
  if (!trimmed) {
    return undefined
  }
  if (links.has(trimmed)) {
    return trimmed
  }
  return undefined
}

function parseSynraConnectType(value: unknown): 'fresh' | 'paired' | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const normalized = value.trim().toLowerCase()
  if (normalized === 'fresh' || normalized === 'paired') {
    return normalized
  }
  return undefined
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export function createInboundHostTransport(
  options: InboundHostTransportOptions
): InboundHostTransport {
  const inboundLinksByPeerWireId = new Map<string, InboundTcpLink>()
  const inboundLinkBySocket = new WeakMap<Socket, InboundTcpLink>()
  const decoders = new WeakMap<Socket, LengthPrefixedJsonCodec>()
  let server: Server | undefined
  let responder: UdpSocket | undefined
  let bonjour: Bonjour | undefined
  let published: BonjourService | undefined

  const collectUdpBroadcastDestinations = (): string[] => {
    const destinations = new Set<string>(['255.255.255.255'])
    const interfaces = networkInterfaces()
    for (const records of Object.values(interfaces)) {
      for (const record of records ?? []) {
        if (record.family !== 'IPv4' || record.internal) {
          continue
        }
        if (typeof record.cidr !== 'string' || record.cidr.length === 0) {
          continue
        }
        const [ipText, prefixText] = record.cidr.split('/')
        const prefix = Number(prefixText)
        if (!ipText || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
          continue
        }
        const ipInt = ipv4ToInt(ipText)
        if (ipInt === undefined) {
          continue
        }
        const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
        const broadcastInt = (ipInt & mask) | (~mask >>> 0)
        const broadcast = intToIpv4(broadcastInt >>> 0)
        if (broadcast) {
          destinations.add(broadcast)
        }
      }
    }
    return [...destinations]
  }

  // SYNRA-COMM::UDP_DISCOVERY::SEND::OFFLINE_ANNOUNCEMENT
  const broadcastOfflineAnnouncement = async (): Promise<void> => {
    const socket = createSocket('udp4')
    socket.setBroadcast(true)
    const sourceHostIp = pickPrimarySourceHostIp()
    const destinations = collectUdpBroadcastDestinations()
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const payload = Buffer.from(
        `${UDP_DISCOVERY_MAGIC} ${JSON.stringify({
          type: UDP_OFFLINE_ANNOUNCEMENT_TYPE,
          sourceDeviceId: options.resolveLocalDeviceUuid(),
          sourceHostIp,
          timestamp: Date.now()
        })}`,
        'utf8'
      )
      await Promise.all(
        destinations.map(
          (address) =>
            new Promise<void>((resolve) => {
              socket.send(payload, UDP_DISCOVERY_PORT, address, () => resolve())
            })
        )
      )
      if (attempt < 2) {
        await new Promise<void>((resolve) => setTimeout(resolve, 120))
      }
    }
    socket.close()
  }

  // SYNRA-COMM::TCP::SEND::FRAME_WRITE
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
    const fromWeak = inboundLinkBySocket.get(socket)
    if (fromWeak) {
      inboundLinkBySocket.delete(socket)
      inboundLinksByPeerWireId.delete(fromWeak.remoteDeviceId)
      options.eventBus.publish({
        type: 'transport.closed',
        deviceId: fromWeak.remoteDeviceId,
        payload: { reason },
        transport: 'tcp'
      })
      return
    }
    for (const [peerWireId, link] of inboundLinksByPeerWireId.entries()) {
      if (link.socket !== socket) {
        continue
      }
      inboundLinksByPeerWireId.delete(peerWireId)
      inboundLinkBySocket.delete(socket)
      options.eventBus.publish({
        type: 'transport.closed',
        deviceId: peerWireId,
        payload: { reason },
        transport: 'tcp'
      })
      return
    }
  }

  const isControlEvent = (event: string): boolean =>
    event === DEVICE_TCP_CONNECT_EVENT ||
    event === DEVICE_TCP_CONNECT_ACK_EVENT ||
    event === DEVICE_TCP_ACK_EVENT ||
    event === DEVICE_TCP_CLOSE_EVENT ||
    event === DEVICE_TCP_HEARTBEAT_EVENT ||
    event === DEVICE_TCP_ERROR_EVENT ||
    event === DEVICE_HOST_RETIRE_EVENT ||
    event === DEVICE_MEMBER_OFFLINE_EVENT

  // SYNRA-COMM::TCP::RECEIVE::INBOUND_RECV_LOOP
  const handleFrame = async (socket: Socket, frame: LanFrame): Promise<void> => {
    // SYNRA-COMM::DEVICE_HANDSHAKE::CONNECT::INBOUND_ACCEPT
    if (frame.event === DEVICE_TCP_CONNECT_EVENT) {
      const payload =
        frame.payload && typeof frame.payload === 'object'
          ? (frame.payload as Record<string, unknown>)
          : {}
      const localDeviceUuid = options.resolveLocalDeviceUuid().trim()
      const targetUuid = typeof frame.target === 'string' ? frame.target.trim() : ''
      const remoteDeviceId =
        typeof payload.from === 'string' && payload.from.trim().length > 0
          ? payload.from.trim()
          : ''
      const peerHost = peerAddressFromSocket(socket.remoteAddress)
      const remote = `${peerHost ?? 'unknown'}:${String(socket.remotePort ?? 0)}`
      const peerDisplayName =
        typeof payload.displayName === 'string' && payload.displayName.length > 0
          ? payload.displayName
          : undefined
      const incomingSynraConnectPayload: Record<string, unknown> = { ...payload }
      const appOk = payload.appId === 'synra'
      const targetValid =
        targetUuid.length > 0 && localDeviceUuid.length > 0 && targetUuid === localDeviceUuid
      if (!appOk || !remoteDeviceId || !targetValid) {
        await writeFrame(socket, {
          requestId: frame.requestId,
          event: DEVICE_TCP_ERROR_EVENT,
          from: options.resolveLocalDeviceUuid(),
          target: remoteDeviceId || 'unknown',
          timestamp: Date.now(),
          payload: { code: 'CONNECT_INVALID' }
        }).catch(() => undefined)
        socket.end()
        return
      }
      const peerWireId = remoteDeviceId
      const hostListsPeerAsPaired = isWirePeerInMainPairedList(remoteDeviceId)
      const incomingConnectType = parseSynraConnectType(payload.connectType)
      const ackConnectType: 'fresh' | 'paired' = hostListsPeerAsPaired ? 'paired' : 'fresh'
      options.eventBus.publish({
        type: 'host.member.online',
        payload: {
          deviceId: peerWireId,
          host: peerHost,
          port: options.port ?? DEFAULT_TCP_PORT,
          displayName: peerDisplayName,
          source: 'transport',
          connectable: true
        },
        transport: 'tcp'
      })
      await writeFrame(socket, {
        requestId: frame.requestId,
        event: DEVICE_TCP_CONNECT_ACK_EVENT,
        from: options.resolveLocalDeviceUuid(),
        target: peerWireId,
        timestamp: Date.now(),
        payload: {
          appId: 'synra',
          from: options.resolveLocalDeviceUuid(),
          sourceHostIp: normalizeRemoteIp(socket.localAddress),
          displayName: localDisplayName(),
          connectType: ackConnectType,
          hostListsPeerAsPaired
        }
      })
      if (!hostListsPeerAsPaired && incomingConnectType === 'paired') {
        socket.end()
        return
      }
      const existing = inboundLinksByPeerWireId.get(peerWireId)
      if (existing && existing.socket !== socket) {
        inboundLinkBySocket.delete(existing.socket)
        existing.socket.destroy()
      }
      const link: InboundTcpLink = {
        socket,
        remote,
        remoteDeviceId: peerWireId,
        displayName: peerDisplayName,
        openedAt: Date.now(),
        lastActiveAt: Date.now()
      }
      inboundLinksByPeerWireId.set(peerWireId, link)
      inboundLinkBySocket.set(socket, link)
      options.eventBus.publish({
        type: 'transport.opened',
        deviceId: peerWireId,
        payload: {
          direction: 'inbound',
          deviceId: peerWireId,
          displayName: peerDisplayName,
          incomingSynraConnectPayload,
          ...(peerHost
            ? {
                host: peerHost,
                port: options.port ?? DEFAULT_TCP_PORT
              }
            : {})
        },
        transport: 'tcp'
      })
      return
    }

    const link = inboundLinkBySocket.get(socket)
    if (!link || link.socket.destroyed) {
      return
    }
    if (!frame.from && frame.event !== DEVICE_TCP_HEARTBEAT_EVENT) {
      return
    }
    link.lastActiveAt = Date.now()

    if (frame.event === DEVICE_TCP_HEARTBEAT_EVENT) {
      await writeFrame(link.socket, {
        requestId: randomUUID(),
        event: DEVICE_TCP_HEARTBEAT_EVENT,
        from: options.resolveLocalDeviceUuid(),
        target: link.remoteDeviceId,
        timestamp: Date.now()
      }).catch(() => undefined)
      return
    }
    // SYNRA-COMM::TCP::ACK::MESSAGE_ACK_AUTO
    if (!isControlEvent(frame.event)) {
      const ackTarget =
        typeof frame.target === 'string' && frame.target.length > 0
          ? frame.target
          : link.remoteDeviceId
      await writeFrame(link.socket, {
        requestId: randomUUID(),
        event: DEVICE_TCP_ACK_EVENT,
        from: options.resolveLocalDeviceUuid(),
        target: ackTarget,
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
        deviceId: link.remoteDeviceId,
        event: frame.event,
        target: frame.target,
        from: frame.from,
        replyRequestId: frame.replyRequestId,
        payload: envelopePayload,
        transport: 'tcp'
      })
      return
    }
    if (frame.event === DEVICE_TCP_CLOSE_EVENT) {
      inboundLinksByPeerWireId.delete(link.remoteDeviceId)
      inboundLinkBySocket.delete(socket)
      link.socket.destroy()
      options.eventBus.publish({
        type: 'transport.closed',
        deviceId: link.remoteDeviceId,
        payload: { reason: 'REMOTE_CLOSED' },
        transport: 'tcp'
      })
      return
    }
    if (frame.event === DEVICE_TCP_ACK_EVENT && frame.replyRequestId) {
      options.eventBus.publish({
        type: 'transport.message.ack',
        deviceId: link.remoteDeviceId,
        event: frame.event,
        target: frame.target,
        from: frame.from,
        replyRequestId: frame.replyRequestId,
        payload: {
          requestId: frame.requestId
        },
        transport: 'tcp'
      })
    }
  }

  // SYNRA-COMM::TCP::CONNECT::INBOUND_LISTEN
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
          console.info('[tcp-message-recv]', {
            event: frame.event,
            requestId: frame.requestId,
            from: frame.from,
            target: frame.target,
            replyRequestId: frame.replyRequestId,
            timestamp: frame.timestamp
          })
          void handleFrame(socket, frame).catch((error: unknown) => {
            options.eventBus.publish({
              type: 'transport.error',
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

  // SYNRA-COMM::UDP_DISCOVERY::RECEIVE::UDP_RESPONDER
  const startUdpResponder = async (): Promise<void> => {
    if (responder) {
      return
    }
    responder = createSocket('udp4')
    responder.on('message', (buffer, remote) => {
      const text = buffer.toString('utf8').trim()
      if (text.startsWith(`${UDP_DISCOVERY_MAGIC} `)) {
        const metadataText = text.slice(`${UDP_DISCOVERY_MAGIC} `.length).trim()
        try {
          const metadata = JSON.parse(metadataText) as {
            type?: string
            sourceDeviceId?: string
            sourceHostIp?: string
          }
          if (
            metadata.type === UDP_OFFLINE_ANNOUNCEMENT_TYPE &&
            typeof metadata.sourceDeviceId === 'string' &&
            metadata.sourceDeviceId.length > 0 &&
            metadata.sourceDeviceId !== options.resolveLocalDeviceUuid()
          ) {
            options.eventBus.publish({
              type: 'host.member.offline',
              payload: {
                sourceDeviceId: metadata.sourceDeviceId,
                deviceId: metadata.sourceDeviceId,
                sourceHostIp:
                  typeof metadata.sourceHostIp === 'string' ? metadata.sourceHostIp : undefined
              },
              transport: 'tcp'
            })
          }
        } catch {
          // Ignore malformed UDP metadata.
        }
        return
      }
      if (!text.startsWith(UDP_DISCOVERY_MAGIC)) {
        return
      }
      // Respond with plain JSON for cross-platform compatibility.
      // Android discovery parser expects a raw JSON object payload.
      const payload = Buffer.from(
        JSON.stringify({
          appId: DISCOVERY_APP_ID,
          sourceDeviceId: options.resolveLocalDeviceUuid(),
          protocolVersion: DISCOVERY_PROTOCOL_VERSION,
          displayName: localDisplayName()
        }),
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
        appId: DISCOVERY_APP_ID,
        sourceDeviceId: options.resolveLocalDeviceUuid(),
        protocolVersion: DISCOVERY_PROTOCOL_VERSION,
        displayName: localDisplayName()
      }
    })
  }

  const closeLinks = async (deviceId?: string): Promise<void> => {
    const targetIds = deviceId
      ? (() => {
          const key = resolvePeerWireIdKey(inboundLinksByPeerWireId, deviceId)
          return key ? [key] : [deviceId]
        })()
      : [...inboundLinksByPeerWireId.keys()]
    for (const targetId of targetIds) {
      const link = inboundLinksByPeerWireId.get(targetId)
      if (!link) {
        continue
      }
      await writeFrame(link.socket, {
        requestId: randomUUID(),
        event: DEVICE_TCP_CLOSE_EVENT,
        from: options.resolveLocalDeviceUuid(),
        target: link.remoteDeviceId,
        timestamp: Date.now()
      }).catch(() => undefined)
      options.eventBus.publish({
        type: 'transport.closed',
        deviceId: targetId,
        payload: { reason: 'LOCAL_CLOSED' },
        transport: 'tcp'
      })
      inboundLinkBySocket.delete(link.socket)
      link.socket.destroy()
      inboundLinksByPeerWireId.delete(targetId)
    }
  }

  return {
    async start() {
      await startTcpServer()
      if (options.enableUdpResponder !== false) {
        await startUdpResponder()
      }
      if (options.enableBonjour !== false) {
        startBonjour()
      }
    },
    async stop() {
      await broadcastOfflineAnnouncement().catch(() => undefined)
      for (const link of inboundLinksByPeerWireId.values()) {
        inboundLinkBySocket.delete(link.socket)
        link.socket.destroy()
      }
      inboundLinksByPeerWireId.clear()
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
    async closeTransport(deviceId) {
      // SYNRA-COMM::TCP::CLOSE::TRANSPORT_CLOSE
      await closeLinks(deviceId)
    },
    async sendMessage(sendOptions) {
      // SYNRA-COMM::TCP::SEND::MESSAGE_SEND
      const targetKey = resolvePeerWireIdKey(inboundLinksByPeerWireId, sendOptions.target)
      const link = targetKey ? inboundLinksByPeerWireId.get(targetKey) : undefined
      if (!link || link.socket.destroyed) {
        return false
      }
      if (!isUuidLike(sendOptions.from.trim())) {
        throw new Error('Message from must be UUID.')
      }
      const localFrom = options.resolveLocalDeviceUuid().trim()
      if (!isUuidLike(localFrom)) {
        throw new Error('Local device UUID is unavailable.')
      }
      await writeFrame(link.socket, {
        requestId: sendOptions.requestId,
        event: sendOptions.event,
        from: localFrom,
        target: link.remoteDeviceId,
        replyRequestId: sendOptions.replyRequestId,
        timestamp: sendOptions.timestamp ?? Date.now(),
        payload: sendOptions.payload
      })
      return true
    },
    async sendLanEvent(sendOptions) {
      // SYNRA-COMM::TCP::SEND::LAN_EVENT_SEND
      const targetKey = resolvePeerWireIdKey(inboundLinksByPeerWireId, sendOptions.target)
      const link = targetKey ? inboundLinksByPeerWireId.get(targetKey) : undefined
      if (!link || link.socket.destroyed) {
        return false
      }
      if (!isUuidLike(sendOptions.from.trim())) {
        throw new Error('Message from must be UUID.')
      }
      const localFrom = options.resolveLocalDeviceUuid().trim()
      if (!isUuidLike(localFrom)) {
        throw new Error('Local device UUID is unavailable.')
      }
      await writeFrame(link.socket, {
        requestId: sendOptions.requestId,
        event: sendOptions.event,
        from: localFrom,
        target: link.remoteDeviceId,
        replyRequestId: sendOptions.replyRequestId,
        timestamp: sendOptions.timestamp ?? Date.now(),
        payload: sendOptions.payload
      })
      return true
    },
    getTransportState(deviceId) {
      if (deviceId) {
        const targetKey = resolvePeerWireIdKey(inboundLinksByPeerWireId, deviceId)
        const target = targetKey ? inboundLinksByPeerWireId.get(targetKey) : undefined
        if (!target) {
          return undefined
        }
        return {
          deviceId: target.remoteDeviceId,
          state: 'open',
          direction: 'inbound',
          openedAt: target.openedAt,
          transport: 'tcp'
        }
      }
      const first = inboundLinksByPeerWireId.values().next().value as InboundTcpLink | undefined
      if (!first) {
        return undefined
      }
      return {
        deviceId: first.remoteDeviceId,
        state: 'open',
        direction: 'inbound',
        openedAt: first.openedAt,
        transport: 'tcp'
      }
    },
    async heartbeatTick() {
      // SYNRA-COMM::TCP::HEARTBEAT::TRANSPORT_HEARTBEAT
      const now = Date.now()
      for (const [deviceId, link] of inboundLinksByPeerWireId.entries()) {
        if (now - link.lastActiveAt <= DEFAULT_HEARTBEAT_TIMEOUT_MS) {
          continue
        }
        options.eventBus.publish({
          type: 'host.heartbeat.timeout',
          deviceId,
          code: 'INBOUND_HEARTBEAT_TIMEOUT',
          transport: 'tcp'
        })
        await closeLinks(deviceId)
      }
    }
  }
}

function ipv4ToInt(ip: string): number | undefined {
  const parts = ip.split('.')
  if (parts.length !== 4) {
    return undefined
  }
  const nums = parts.map((part) => Number(part))
  if (nums.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    return undefined
  }
  return (
    (((nums[0] ?? 0) << 24) | ((nums[1] ?? 0) << 16) | ((nums[2] ?? 0) << 8) | (nums[3] ?? 0)) >>> 0
  )
}

function intToIpv4(value: number): string {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff].join(
    '.'
  )
}
