import { randomUUID } from 'node:crypto'
import { createSocket, type Socket as UdpSocket } from 'node:dgram'
import { createServer, type Server, type Socket } from 'node:net'
import { networkInterfaces } from 'node:os'
import { Bonjour, type Service as BonjourService } from 'bonjour-service'
import type {
  DeviceDiscoveryHostEvent,
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
import { hashDeviceId, localDisplayName } from '../core/device-identity'
import { normalizeRemoteIp, peerAddressFromSocket, pickPrimarySourceHostIp } from '../core/network'
import type { HostEventBus } from '../events/host-event-bus'
import {
  LAN_APP_ID,
  LAN_PROTOCOL_VERSION,
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
}

const UDP_OFFLINE_ANNOUNCEMENT_TYPE = 'offline'

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

/** Stable wire `device-*` key for indexing this peer (connect `sourceDeviceId` may be UUID or wire id). */
function canonicalPeerWireId(connectSourceDeviceId: string): string {
  const trimmed = connectSourceDeviceId.trim()
  if (!trimmed) {
    return hashDeviceId('unknown')
  }
  if (trimmed.startsWith('device-')) {
    return trimmed
  }
  return hashDeviceId(trimmed)
}

/** Resolve API / frame peer id to an open inbound link key (UUID → hash, or wire id as stored). */
function resolvePeerWireIdKey(links: Map<string, InboundTcpLink>, id: string): string | undefined {
  const trimmed = id.trim()
  if (!trimmed) {
    return undefined
  }
  if (links.has(trimmed)) {
    return trimmed
  }
  const hashed = hashDeviceId(trimmed)
  if (links.has(hashed)) {
    return hashed
  }
  return undefined
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
        remote: fromWeak.remote,
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
        remote: link.remote,
        deviceId: peerWireId,
        payload: { reason },
        transport: 'tcp'
      })
      return
    }
  }

  const handleFrame = async (socket: Socket, frame: LanFrame): Promise<void> => {
    if (frame.type === 'connect') {
      const payload =
        frame.payload && typeof frame.payload === 'object'
          ? (frame.payload as Record<string, unknown>)
          : {}
      const remoteDeviceId =
        typeof payload.sourceDeviceId === 'string' && payload.sourceDeviceId.trim().length > 0
          ? payload.sourceDeviceId.trim()
          : ''
      const peerHost = peerAddressFromSocket(socket.remoteAddress)
      const remote = `${peerHost ?? 'unknown'}:${String(socket.remotePort ?? 0)}`
      const peerDisplayName =
        typeof payload.displayName === 'string' && payload.displayName.length > 0
          ? payload.displayName
          : undefined
      const incomingSynraConnectPayload: Record<string, unknown> = { ...payload }
      const appOk = frame.appId === LAN_APP_ID
      if (!appOk || !remoteDeviceId) {
        await writeFrame(socket, {
          version: LAN_PROTOCOL_VERSION,
          type: 'error',
          requestId: frame.requestId ?? randomUUID(),
          sourceDeviceId: options.resolveLocalDeviceUuid(),
          targetDeviceId: canonicalPeerWireId(remoteDeviceId || 'unknown'),
          timestamp: Date.now(),
          appId: LAN_APP_ID,
          error: 'CONNECT_INVALID'
        }).catch(() => undefined)
        socket.end()
        return
      }
      const peerWireId = canonicalPeerWireId(remoteDeviceId)
      options.eventBus.publish({
        type: 'host.member.online',
        remote,
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
        version: LAN_PROTOCOL_VERSION,
        type: 'connectAck',
        requestId: frame.requestId ?? randomUUID(),
        sourceDeviceId: options.resolveLocalDeviceUuid(),
        targetDeviceId: peerWireId,
        timestamp: Date.now(),
        appId: LAN_APP_ID,
        protocolVersion: LAN_PROTOCOL_VERSION,
        capabilities: ['message', 'event'],
        payload: {
          sourceDeviceId: options.resolveLocalDeviceUuid(),
          sourceHostIp: normalizeRemoteIp(socket.localAddress),
          displayName: localDisplayName()
        }
      })
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
        remote,
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
    if (!frame.sourceDeviceId && frame.type !== 'heartbeat') {
      return
    }
    link.lastActiveAt = Date.now()

    if (frame.type === 'heartbeat') {
      await writeFrame(link.socket, {
        version: LAN_PROTOCOL_VERSION,
        type: 'heartbeat',
        requestId: randomUUID(),
        sourceDeviceId: options.resolveLocalDeviceUuid(),
        targetDeviceId: link.remoteDeviceId,
        timestamp: Date.now()
      }).catch(() => undefined)
      return
    }
    if (frame.type === 'message') {
      await writeFrame(link.socket, {
        version: LAN_PROTOCOL_VERSION,
        type: 'ack',
        requestId: frame.requestId,
        sourceDeviceId: options.resolveLocalDeviceUuid(),
        targetDeviceId: link.remoteDeviceId,
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
        remote: link.remote,
        deviceId: link.remoteDeviceId,
        messageId: frame.messageId,
        messageType,
        payload: frame.payload,
        transport: 'tcp'
      })
      return
    }
    if (frame.type === 'event') {
      const pl =
        frame.payload && typeof frame.payload === 'object'
          ? (frame.payload as Record<string, unknown>)
          : {}
      const eventName = typeof pl.eventName === 'string' ? pl.eventName : ''
      options.eventBus.publish({
        type: 'transport.lan.event.received',
        remote: link.remote,
        deviceId: link.remoteDeviceId,
        payload: {
          requestId: frame.requestId,
          sourceDeviceId: frame.sourceDeviceId,
          targetDeviceId: frame.targetDeviceId,
          replyToRequestId: frame.replyToRequestId,
          eventName,
          eventPayload: pl.payload,
          fromDeviceId: link.remoteDeviceId
        },
        transport: 'tcp'
      })
      return
    }
    if (frame.type === 'close') {
      inboundLinksByPeerWireId.delete(link.remoteDeviceId)
      inboundLinkBySocket.delete(socket)
      link.socket.destroy()
      options.eventBus.publish({
        type: 'transport.closed',
        remote: link.remote,
        deviceId: link.remoteDeviceId,
        payload: { reason: 'REMOTE_CLOSED' },
        transport: 'tcp'
      })
      return
    }
    if (frame.type === 'ack' && frame.messageId) {
      options.eventBus.publish({
        type: 'transport.message.ack',
        remote: link.remote,
        deviceId: link.remoteDeviceId,
        messageId: frame.messageId,
        payload: {
          requestId: frame.requestId,
          targetDeviceId: frame.targetDeviceId
        },
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
              remote: `${remote.address}:${String(remote.port)}`,
              payload: {
                sourceDeviceId: metadata.sourceDeviceId,
                deviceId: hashDeviceId(metadata.sourceDeviceId),
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
          appId: LAN_APP_ID,
          sourceDeviceId: options.resolveLocalDeviceUuid(),
          protocolVersion: LAN_PROTOCOL_VERSION,
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
        appId: LAN_APP_ID,
        sourceDeviceId: options.resolveLocalDeviceUuid(),
        protocolVersion: LAN_PROTOCOL_VERSION,
        displayName: localDisplayName()
      }
    })
  }

  const closeSessions = async (deviceId?: string): Promise<void> => {
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
        version: LAN_PROTOCOL_VERSION,
        type: 'close',
        requestId: randomUUID(),
        sourceDeviceId: options.resolveLocalDeviceUuid(),
        targetDeviceId: link.remoteDeviceId,
        timestamp: Date.now()
      }).catch(() => undefined)
      options.eventBus.publish({
        type: 'transport.closed',
        remote: link.remote,
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
      await startUdpResponder()
      startBonjour()
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
      await closeSessions(deviceId)
    },
    async sendMessage(sendOptions) {
      const targetKey = resolvePeerWireIdKey(inboundLinksByPeerWireId, sendOptions.targetDeviceId)
      const link = targetKey ? inboundLinksByPeerWireId.get(targetKey) : undefined
      if (!link || link.socket.destroyed) {
        return false
      }
      await writeFrame(link.socket, {
        version: LAN_PROTOCOL_VERSION,
        type: 'message',
        requestId: sendOptions.requestId,
        sourceDeviceId: sendOptions.sourceDeviceId,
        targetDeviceId: link.remoteDeviceId,
        replyToRequestId: sendOptions.replyToRequestId,
        messageId: sendOptions.messageId ?? randomUUID(),
        timestamp: Date.now(),
        payload: {
          messageType: sendOptions.messageType,
          payload: sendOptions.payload
        }
      })
      return true
    },
    async sendLanEvent(sendOptions) {
      const targetKey = resolvePeerWireIdKey(inboundLinksByPeerWireId, sendOptions.targetDeviceId)
      const link = targetKey ? inboundLinksByPeerWireId.get(targetKey) : undefined
      if (!link || link.socket.destroyed) {
        return false
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
      await writeFrame(link.socket, {
        version: LAN_PROTOCOL_VERSION,
        type: 'event',
        requestId: sendOptions.requestId,
        sourceDeviceId: sendOptions.sourceDeviceId,
        targetDeviceId: link.remoteDeviceId,
        replyToRequestId: sendOptions.replyToRequestId,
        timestamp: Date.now(),
        payload: envelope
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
      const now = Date.now()
      for (const [deviceId, link] of inboundLinksByPeerWireId.entries()) {
        if (now - link.lastActiveAt <= DEFAULT_HEARTBEAT_TIMEOUT_MS) {
          continue
        }
        options.eventBus.publish({
          type: 'host.heartbeat.timeout',
          remote: link.remote,
          deviceId,
          code: 'INBOUND_HEARTBEAT_TIMEOUT',
          transport: 'tcp'
        })
        await closeSessions(deviceId)
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
