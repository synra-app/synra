import { createHash, randomUUID } from 'node:crypto'
import { createSocket } from 'node:dgram'
import { createServer, Socket } from 'node:net'
import { networkInterfaces } from 'node:os'
import { Bonjour } from 'bonjour-service'
import { BridgeError } from '../../shared/errors/bridge-error'
import { BRIDGE_ERROR_CODES } from '../../shared/errors/codes'
import type {
  DeviceDiscoveryListResult,
  DeviceDiscoveryProbeConnectableOptions,
  DeviceDiscoveryProbeConnectableResult,
  DeviceDiscoveryPairOptions,
  DeviceDiscoveryPairResult,
  DeviceSessionCloseOptions,
  DeviceSessionCloseResult,
  DeviceSessionGetStateOptions,
  DeviceSessionOpenOptions,
  DeviceSessionOpenResult,
  DeviceSessionSendMessageOptions,
  DeviceSessionSendMessageResult,
  DeviceSessionSnapshot,
  DeviceDiscoveryStartOptions,
  DeviceDiscoveryStartResult,
  DeviceDiscoveryPullHostEventsResult,
  DeviceDiscoveryHostEvent,
  DiscoveredDevice
} from '../../shared/protocol/types'

const DEFAULT_SCAN_WINDOW_MS = 15_000
const DEFAULT_TCP_PORT = 32100
const DEFAULT_PROBE_TIMEOUT_MS = 1500
const DEFAULT_PROBE_CONCURRENCY = 24
const DEFAULT_DISCOVERY_TIMEOUT_MS = 1500
const UDP_DISCOVERY_PORT = 32101
const UDP_DISCOVERY_MAGIC = 'SYNRA_DISCOVERY_V1'
const DEFAULT_MDNS_SERVICE_TYPE = '_synra._tcp.local'
const DEFAULT_ACK_TIMEOUT_MS = 3000
const MAX_FRAME_BYTES = 256 * 1024
const MAX_SEND_RETRIES = 3
const SYNRA_APP_ID = 'synra'
const SYNRA_PROTOCOL_VERSION = '1.0'

type DeviceSource = DiscoveredDevice['source']
type DiscoveryMode = NonNullable<DeviceDiscoveryStartOptions['discoveryMode']>
type NetworkSeed = {
  address: string
}

type DeviceDiscoveryState = DeviceDiscoveryListResult['state']

type DeviceDiscoveryMap = Map<string, DiscoveredDevice>
type DeviceDiscoveryServiceOptions = {
  onHostEvent?: (event: DeviceDiscoveryHostEvent) => void
}

export interface DeviceDiscoveryService {
  startDiscovery(options?: DeviceDiscoveryStartOptions): Promise<DeviceDiscoveryStartResult>
  stopDiscovery(): Promise<{ success: true }>
  listDevices(): Promise<DeviceDiscoveryListResult>
  pairDevice(options: DeviceDiscoveryPairOptions): Promise<DeviceDiscoveryPairResult>
  probeConnectable(
    options?: DeviceDiscoveryProbeConnectableOptions
  ): Promise<DeviceDiscoveryProbeConnectableResult>
  openSession(options: DeviceSessionOpenOptions): Promise<DeviceSessionOpenResult>
  closeSession(options?: DeviceSessionCloseOptions): Promise<DeviceSessionCloseResult>
  sendMessage(options: DeviceSessionSendMessageOptions): Promise<DeviceSessionSendMessageResult>
  getSessionState(options?: DeviceSessionGetStateOptions): Promise<DeviceSessionSnapshot>
  pullHostEvents(): Promise<DeviceDiscoveryPullHostEventsResult>
}

type InternalDiscoveryState = {
  state: DeviceDiscoveryState
  startedAt?: number
  scanWindowMs: number
  devices: DeviceDiscoveryMap
}

type LanFrame = {
  version: string
  type: 'hello' | 'helloAck' | 'message' | 'ack' | 'close' | 'error'
  sessionId?: string
  messageId?: string
  timestamp: number
  appId?: string
  protocolVersion?: string
  capabilities?: string[]
  payload?: unknown
  error?: string
}

type SessionState = {
  sessionId?: string
  deviceId?: string
  host?: string
  port?: number
  state: DeviceSessionSnapshot['state']
  openedAt?: number
  closedAt?: number
  lastError?: string
}

type InboundSessionState = {
  sessionId: string
  remote: string
  socket: Socket
  openedAt: number
  lastActiveAt: number
}

class FrameDecoder {
  private buffer = Buffer.alloc(0)

  push(chunk: Buffer): LanFrame[] {
    this.buffer = Buffer.concat([this.buffer, chunk])
    const frames: LanFrame[] = []

    while (this.buffer.length >= 4) {
      const frameLength = this.buffer.readUInt32BE(0)
      if (frameLength > MAX_FRAME_BYTES) {
        this.buffer = this.buffer.subarray(4)
        continue
      }
      if (this.buffer.length < frameLength + 4) {
        break
      }

      const frameBuffer = this.buffer.subarray(4, frameLength + 4)
      this.buffer = this.buffer.subarray(frameLength + 4)
      try {
        const decoded = JSON.parse(frameBuffer.toString('utf8')) as LanFrame
        frames.push(decoded)
      } catch {
        // Ignore malformed frames and continue.
      }
    }

    return frames
  }
}

function encodeFrame(frame: LanFrame): Buffer {
  const payload = Buffer.from(JSON.stringify(frame), 'utf8')
  if (payload.length > MAX_FRAME_BYTES) {
    throw new BridgeError(BRIDGE_ERROR_CODES.invalidParams, 'Frame payload is too large.', {
      bytes: payload.length,
      maxBytes: MAX_FRAME_BYTES
    })
  }
  const header = Buffer.allocUnsafe(4)
  header.writeUInt32BE(payload.length, 0)
  return Buffer.concat([header, payload])
}

function hashDeviceId(input: string): string {
  return `device-${createHash('sha1').update(input).digest('hex').slice(0, 12)}`
}

function toDevice(
  key: string,
  name: string,
  ipAddress: string,
  source: DeviceSource,
  paired = false
): DiscoveredDevice {
  return {
    deviceId: hashDeviceId(key),
    name,
    ipAddress,
    source,
    paired,
    connectable: false,
    discoveredAt: Date.now(),
    lastSeenAt: Date.now()
  }
}

function collectInterfaceSeeds(includeLoopback: boolean): NetworkSeed[] {
  const interfaces = networkInterfaces()
  const entries: NetworkSeed[] = []

  for (const [_ifaceName, ifaceRecords] of Object.entries(interfaces)) {
    for (const iface of ifaceRecords ?? []) {
      if (iface.family !== 'IPv4') {
        continue
      }

      if (iface.internal && !includeLoopback) {
        continue
      }

      entries.push({
        address: iface.address
      })
    }
  }

  return entries
}

function collectLocalIpSet(includeLoopback: boolean): Set<string> {
  return new Set(collectInterfaceSeeds(includeLoopback).map((seed) => seed.address))
}

function collectManualDevices(manualTargets: string[]): DiscoveredDevice[] {
  return manualTargets
    .filter((target) => target.length > 0)
    .map((target, index) =>
      toDevice(`manual:${target}`, `Manual Target ${index + 1}`, target, 'manual')
    )
}

function toAutoDiscoveredDevice(
  ipAddress: string,
  source: DeviceSource,
  name?: string
): DiscoveredDevice {
  return toDevice(`auto:${ipAddress}`, name ?? `Synra Device ${ipAddress}`, ipAddress, source)
}

function parseMdnsServiceType(serviceType?: string): { type: string; protocol: 'tcp' | 'udp' } {
  const fallback = DEFAULT_MDNS_SERVICE_TYPE
  const normalized = (serviceType && serviceType.length > 0 ? serviceType : fallback)
    .trim()
    .replace(/^\./, '')
    .replace(/\.local\.?$/, '')
  const segments = normalized.split('.').filter((segment) => segment.length > 0)
  if (segments.length >= 2) {
    const typeSegment = segments[0] ?? '_synra'
    const protocolSegment = segments[1] === '_udp' ? 'udp' : 'tcp'
    return {
      type: typeSegment.replace(/^_/, ''),
      protocol: protocolSegment
    }
  }
  return { type: 'synra', protocol: 'tcp' }
}

function mergeDevices(target: DeviceDiscoveryMap, devices: DiscoveredDevice[]): void {
  for (const device of devices) {
    const existing = target.get(device.deviceId)
    if (existing) {
      target.set(device.deviceId, {
        ...existing,
        ...device,
        paired: existing.paired || device.paired,
        lastSeenAt: Date.now()
      })
      continue
    }

    target.set(device.deviceId, device)
  }
}

function pruneSelfDevices(target: DeviceDiscoveryMap, localIps: Set<string>): void {
  for (const [deviceId, device] of target.entries()) {
    if (device.source === 'manual') {
      continue
    }
    if (localIps.has(device.ipAddress)) {
      target.delete(deviceId)
    }
  }
}

function toErrorMessage(reason: unknown, fallback: string): string {
  if (typeof reason === 'string' && reason.length > 0) {
    return reason
  }
  if (reason instanceof Error && reason.message.length > 0) {
    return reason.message
  }
  return fallback
}

export function createDeviceDiscoveryService(
  options: DeviceDiscoveryServiceOptions = {}
): DeviceDiscoveryService {
  const state: InternalDiscoveryState = {
    state: 'idle',
    devices: new Map(),
    scanWindowMs: DEFAULT_SCAN_WINDOW_MS
  }
  const session: SessionState = { state: 'idle' }
  let clientSocket: Socket | undefined
  let clientDecoder: FrameDecoder | undefined
  let pendingHelloResolve: ((sessionId: string) => void) | undefined
  let pendingHelloReject: ((reason?: string) => void) | undefined
  const pendingAcks = new Map<string, () => void>()
  const queuedWriteBySocket = new WeakMap<Socket, Promise<void>>()
  const inboundSessions = new Map<string, InboundSessionState>()
  const socketSessionIds = new Map<Socket, Set<string>>()
  const hostEvents: DeviceDiscoveryHostEvent[] = []
  let hostEventId = 0
  function pushHostEvent(
    type: DeviceDiscoveryHostEvent['type'],
    event: Omit<DeviceDiscoveryHostEvent, 'id' | 'timestamp' | 'type'>
  ): void {
    const hostEvent: DeviceDiscoveryHostEvent = {
      id: ++hostEventId,
      timestamp: Date.now(),
      type,
      ...event
    }
    hostEvents.push(hostEvent)
    options.onHostEvent?.(hostEvent)
    if (hostEvents.length > 300) {
      hostEvents.splice(0, hostEvents.length - 300)
    }
  }
  const tcpServer = createServer((socket) => {
    const decoder = new FrameDecoder()
    const remote = `${socket.remoteAddress ?? 'unknown'}:${socket.remotePort ?? 'unknown'}`
    console.log('[lan-discovery] tcp client connected:', remote)
    pushHostEvent('transport.session.opened', { remote })
    socket.on('data', (chunk: Buffer) => {
      const frames = decoder.push(chunk)
      for (const frame of frames) {
        if (frame.type === 'hello') {
          if (frame.sessionId) {
            bindInboundSession(frame.sessionId, socket, remote)
          }
          const response: LanFrame = {
            version: SYNRA_PROTOCOL_VERSION,
            type: 'helloAck',
            sessionId: frame.sessionId ?? randomUUID(),
            timestamp: Date.now(),
            appId: SYNRA_APP_ID,
            protocolVersion: SYNRA_PROTOCOL_VERSION,
            capabilities: ['message']
          }
          void enqueueSocketFrame(socket, response)
          continue
        }

        if (frame.type === 'message') {
          if (frame.sessionId) {
            bindInboundSession(frame.sessionId, socket, remote)
            const currentInbound = inboundSessions.get(frame.sessionId)
            if (currentInbound) {
              currentInbound.lastActiveAt = Date.now()
            }
          }
          console.log('[lan-discovery] tcp message received:', {
            remote,
            sessionId: frame.sessionId,
            messageId: frame.messageId
          })
          pushHostEvent('transport.message.received', {
            remote,
            sessionId: frame.sessionId,
            messageId: frame.messageId,
            payload: frame.payload
          })
          if (frame.messageId) {
            const ack: LanFrame = {
              version: SYNRA_PROTOCOL_VERSION,
              type: 'ack',
              sessionId: frame.sessionId,
              messageId: frame.messageId,
              timestamp: Date.now()
            }
            void enqueueSocketFrame(socket, ack)
          }
          continue
        }

        if (frame.type === 'ack' && frame.messageId) {
          resolveAck(frame.sessionId, frame.messageId)
          pushHostEvent('transport.message.ack', {
            remote,
            sessionId: frame.sessionId,
            messageId: frame.messageId
          })
          continue
        }
      }
    })
    socket.on('close', () => {
      console.log('[lan-discovery] tcp client closed:', remote)
      releaseSocketInboundSessions(socket)
      pushHostEvent('transport.session.closed', { remote })
    })
  })
  tcpServer.listen(DEFAULT_TCP_PORT, '0.0.0.0')

  const bonjour = new Bonjour()
  const mdnsPublishedService = bonjour.publish({
    name: `synra-${randomUUID().slice(0, 8)}`,
    type: 'synra',
    protocol: 'tcp',
    port: DEFAULT_TCP_PORT,
    txt: {
      appId: SYNRA_APP_ID
    }
  })
  mdnsPublishedService?.start?.()

  const udpResponder = createSocket('udp4')
  udpResponder.on('message', (message, remote) => {
    if (message.toString('utf8').trim() !== UDP_DISCOVERY_MAGIC) {
      return
    }
    const payload = Buffer.from(
      JSON.stringify({
        appId: SYNRA_APP_ID,
        protocolVersion: SYNRA_PROTOCOL_VERSION,
        port: DEFAULT_TCP_PORT
      }),
      'utf8'
    )
    udpResponder.send(payload, remote.port, remote.address)
  })
  udpResponder.on('error', () => {
    // ignore discovery responder errors
  })
  udpResponder.bind(UDP_DISCOVERY_PORT, () => {
    udpResponder.setBroadcast(true)
  })

  async function discoverViaMdns(
    options: {
      serviceType?: string
      timeoutMs: number
    } = { timeoutMs: DEFAULT_DISCOVERY_TIMEOUT_MS }
  ): Promise<DiscoveredDevice[]> {
    const discovered = new Map<string, DiscoveredDevice>()
    const service = parseMdnsServiceType(options.serviceType)
    const browser = bonjour.find({
      type: service.type,
      protocol: service.protocol
    })
    browser.on('up', (entry) => {
      const name = typeof entry.name === 'string' ? entry.name : undefined
      for (const address of entry.addresses ?? []) {
        if (typeof address !== 'string' || !/^\d+\.\d+\.\d+\.\d+$/.test(address)) {
          continue
        }
        discovered.set(address, toAutoDiscoveredDevice(address, 'mdns', name))
      }
    })

    await new Promise<void>((resolve) => {
      setTimeout(
        () => {
          browser.stop()
          resolve()
        },
        Math.max(200, options.timeoutMs)
      )
    })
    return [...discovered.values()]
  }

  async function discoverViaUdp(timeoutMs: number): Promise<DiscoveredDevice[]> {
    return new Promise<DiscoveredDevice[]>((resolve) => {
      const socket = createSocket('udp4')
      const discovered = new Map<string, DiscoveredDevice>()
      const finish = (): void => {
        socket.close()
        resolve([...discovered.values()])
      }

      socket.on('message', (message, remote) => {
        try {
          const payload = JSON.parse(message.toString('utf8')) as {
            appId?: string
            protocolVersion?: string
            port?: number
          }
          if (payload.appId !== SYNRA_APP_ID) {
            return
          }
          discovered.set(
            remote.address,
            toAutoDiscoveredDevice(remote.address, 'probe', `Synra Device ${remote.address}`)
          )
        } catch {
          // ignore malformed payload
        }
      })
      socket.on('error', () => finish())

      socket.bind(0, () => {
        socket.setBroadcast(true)
        socket.send(Buffer.from(UDP_DISCOVERY_MAGIC, 'utf8'), UDP_DISCOVERY_PORT, '255.255.255.255')
      })

      setTimeout(finish, Math.max(200, timeoutMs))
    })
  }

  function enqueueSocketFrame(socket: Socket, frame: LanFrame): Promise<void> {
    const previous = queuedWriteBySocket.get(socket) ?? Promise.resolve()
    const current = previous
      .catch(() => undefined)
      .then(async () => {
        if (socket.destroyed) {
          throw new BridgeError(BRIDGE_ERROR_CODES.unsupportedOperation, 'Socket is destroyed.')
        }
        const encoded = encodeFrame(frame)
        const canContinue = socket.write(encoded)
        if (!canContinue) {
          await new Promise<void>((resolve) => socket.once('drain', () => resolve()))
        }
      })
    queuedWriteBySocket.set(socket, current)
    return current
  }

  function writeClientFrame(frame: LanFrame): Promise<void> {
    if (!clientSocket) {
      throw new BridgeError(
        BRIDGE_ERROR_CODES.unsupportedOperation,
        'Session socket is unavailable.'
      )
    }

    return enqueueSocketFrame(clientSocket, frame)
  }

  function writeSocketFrame(socket: Socket, frame: LanFrame): Promise<void> {
    return enqueueSocketFrame(socket, frame)
  }

  function toAckKey(sessionId: string | undefined, messageId: string): string {
    return `${sessionId ?? 'unknown'}:${messageId}`
  }

  function resolveAck(sessionId: string | undefined, messageId: string): void {
    const key = toAckKey(sessionId, messageId)
    const resolve = pendingAcks.get(key)
    if (resolve) {
      pendingAcks.delete(key)
      resolve()
      return
    }
    const fallback = pendingAcks.get(messageId)
    if (fallback) {
      pendingAcks.delete(messageId)
      fallback()
    }
  }

  function bindInboundSession(sessionId: string, socket: Socket, remote: string): void {
    inboundSessions.set(sessionId, {
      sessionId,
      remote,
      socket,
      openedAt: Date.now(),
      lastActiveAt: Date.now()
    })
    let ids = socketSessionIds.get(socket)
    if (!ids) {
      ids = new Set<string>()
      socketSessionIds.set(socket, ids)
    }
    ids.add(sessionId)
  }

  function releaseSocketInboundSessions(socket: Socket): void {
    const ids = socketSessionIds.get(socket)
    if (!ids) {
      return
    }
    for (const id of ids) {
      inboundSessions.delete(id)
    }
    socketSessionIds.delete(socket)
  }

  function setSessionClosed(reason: string): void {
    session.state = 'closed'
    session.closedAt = Date.now()
    session.lastError = reason
  }

  function attachClientSocketHandlers(socket: Socket): void {
    clientDecoder = new FrameDecoder()
    socket.on('data', (chunk: Buffer) => {
      const frames = clientDecoder?.push(chunk) ?? []
      for (const frame of frames) {
        if (frame.type === 'helloAck') {
          if (frame.appId !== SYNRA_APP_ID) {
            pendingHelloReject?.('HELLO_ACK_APP_ID_MISMATCH')
            pendingHelloReject = undefined
            pendingHelloResolve = undefined
            continue
          }

          session.state = 'open'
          session.sessionId = frame.sessionId ?? session.sessionId ?? randomUUID()
          session.openedAt = Date.now()
          pendingHelloResolve?.(session.sessionId ?? randomUUID())
          pendingHelloResolve = undefined
          pendingHelloReject = undefined
          continue
        }

        if (frame.type === 'ack' && frame.messageId) {
          resolveAck(frame.sessionId, frame.messageId)
          continue
        }
      }
    })

    socket.on('error', (error) => {
      setSessionClosed(error.message)
    })

    socket.on('close', () => {
      if (session.state === 'open' || session.state === 'connecting') {
        setSessionClosed('SOCKET_CLOSED')
      }
      clientSocket = undefined
      clientDecoder = undefined
    })
  }

  async function probeSingleDevice(
    device: DiscoveredDevice,
    port: number,
    timeoutMs: number
  ): Promise<DiscoveredDevice> {
    return new Promise<DiscoveredDevice>((resolve) => {
      const socket = new Socket()
      const decoder = new FrameDecoder()
      const checkedAt = Date.now()
      let settled = false

      const finish = (connectable: boolean, errorMessage?: string): void => {
        if (settled) {
          return
        }
        settled = true
        socket.destroy()
        resolve({
          ...device,
          connectable,
          connectCheckAt: checkedAt,
          connectCheckError: connectable ? undefined : (errorMessage ?? 'NOT_CONNECTABLE'),
          lastSeenAt: Date.now()
        })
      }

      socket.setTimeout(timeoutMs, () => finish(false, 'PROBE_TIMEOUT'))

      socket.on('error', (error) => finish(false, error.message))

      socket.on('data', (chunk: Buffer) => {
        const frames = decoder.push(chunk)
        for (const frame of frames) {
          if (frame.type === 'helloAck') {
            if (frame.appId === SYNRA_APP_ID && frame.protocolVersion) {
              finish(true)
            } else {
              finish(false, 'HELLO_ACK_APP_ID_MISMATCH')
            }
          }
        }
      })

      socket.connect(port, device.ipAddress, () => {
        const hello: LanFrame = {
          version: SYNRA_PROTOCOL_VERSION,
          type: 'hello',
          sessionId: randomUUID(),
          timestamp: Date.now(),
          appId: SYNRA_APP_ID,
          protocolVersion: SYNRA_PROTOCOL_VERSION,
          capabilities: ['message']
        }
        void enqueueSocketFrame(socket, hello)
      })
    })
  }

  async function probeDevicesWithLimit(
    devices: DiscoveredDevice[],
    options: {
      port: number
      timeoutMs: number
      concurrency: number
      deadlineAt?: number
    }
  ): Promise<DiscoveredDevice[]> {
    const pending = [...devices]
    const results: DiscoveredDevice[] = []
    const workerCount = Math.max(1, Math.min(options.concurrency, pending.length || 1))

    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (pending.length > 0) {
          if (options.deadlineAt && Date.now() >= options.deadlineAt) {
            break
          }
          const next = pending.shift()
          if (!next) {
            break
          }
          const probed = await probeSingleDevice(next, options.port, options.timeoutMs)
          results.push(probed)
        }
      })
    )

    return results
  }

  return {
    async startDiscovery(
      options: DeviceDiscoveryStartOptions = {}
    ): Promise<DeviceDiscoveryStartResult> {
      const discoveryMode: DiscoveryMode = options.discoveryMode ?? 'hybrid'
      const shouldIncludeMdns = discoveryMode === 'hybrid' || discoveryMode === 'mdns'
      const shouldIncludeUdpFallback = discoveryMode === 'hybrid'
      const shouldIncludeManual = discoveryMode !== 'mdns'
      const concurrency = Math.max(1, options.concurrency ?? DEFAULT_PROBE_CONCURRENCY)
      const discoveryTimeoutMs =
        options.discoveryTimeoutMs && options.discoveryTimeoutMs > 0
          ? options.discoveryTimeoutMs
          : DEFAULT_DISCOVERY_TIMEOUT_MS

      const reset = options.reset !== false
      if (reset) {
        state.devices.clear()
      }

      state.startedAt = Date.now()
      state.state = 'scanning'
      state.scanWindowMs = options.scanWindowMs ?? DEFAULT_SCAN_WINDOW_MS

      const autoDiscoveredDevices: DiscoveredDevice[] = []
      if (shouldIncludeMdns) {
        autoDiscoveredDevices.push(
          ...(await discoverViaMdns({
            serviceType: options.mdnsServiceType,
            timeoutMs: discoveryTimeoutMs
          }))
        )
      }
      if (autoDiscoveredDevices.length === 0 && shouldIncludeUdpFallback) {
        autoDiscoveredDevices.push(...(await discoverViaUdp(discoveryTimeoutMs)))
      }
      mergeDevices(state.devices, autoDiscoveredDevices)

      if (shouldIncludeManual) {
        const manualDevices = collectManualDevices(options.manualTargets ?? [])
        mergeDevices(state.devices, manualDevices)
      }

      const probeResult = await probeDevicesWithLimit([...state.devices.values()], {
        port: options.port ?? DEFAULT_TCP_PORT,
        timeoutMs: options.timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS,
        concurrency,
        deadlineAt:
          options.discoveryTimeoutMs && options.discoveryTimeoutMs > 0
            ? Date.now() + options.discoveryTimeoutMs
            : undefined
      })

      for (const device of probeResult) {
        state.devices.set(device.deviceId, device)
      }
      pruneSelfDevices(state.devices, collectLocalIpSet(Boolean(options.includeLoopback)))

      return {
        requestId: randomUUID(),
        state: state.state,
        startedAt: state.startedAt,
        scanWindowMs: state.scanWindowMs,
        devices: [...state.devices.values()]
      }
    },
    async stopDiscovery(): Promise<{ success: true }> {
      state.state = 'idle'
      return { success: true }
    },
    async listDevices(): Promise<DeviceDiscoveryListResult> {
      pruneSelfDevices(state.devices, collectLocalIpSet(false))
      return {
        state: state.state,
        startedAt: state.startedAt,
        scanWindowMs: state.scanWindowMs,
        devices: [...state.devices.values()]
      }
    },
    async pairDevice(options: DeviceDiscoveryPairOptions): Promise<DeviceDiscoveryPairResult> {
      const selected = state.devices.get(options.deviceId)
      if (!selected) {
        throw new BridgeError(BRIDGE_ERROR_CODES.notFound, 'Target device was not found.', {
          deviceId: options.deviceId
        })
      }

      const paired = {
        ...selected,
        paired: true,
        lastSeenAt: Date.now()
      }
      state.devices.set(selected.deviceId, paired)

      return {
        success: true,
        device: paired
      }
    },
    async probeConnectable(
      options: DeviceDiscoveryProbeConnectableOptions = {}
    ): Promise<DeviceDiscoveryProbeConnectableResult> {
      const port = options.port ?? DEFAULT_TCP_PORT
      const timeoutMs = options.timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS
      const checkedAt = Date.now()
      const entries = [...state.devices.values()]
      const nextDevices = await probeDevicesWithLimit(entries, {
        port,
        timeoutMs,
        concurrency: DEFAULT_PROBE_CONCURRENCY
      })

      for (const device of nextDevices) {
        state.devices.set(device.deviceId, device)
      }
      pruneSelfDevices(state.devices, collectLocalIpSet(false))

      return {
        checkedAt,
        port,
        timeoutMs,
        devices: [...state.devices.values()]
      }
    },
    async openSession(options: DeviceSessionOpenOptions): Promise<DeviceSessionOpenResult> {
      if (clientSocket) {
        clientSocket.destroy()
        clientSocket = undefined
      }

      const socket = new Socket()
      clientSocket = socket
      session.state = 'connecting'
      session.deviceId = options.deviceId
      session.host = options.host
      session.port = options.port
      session.lastError = undefined
      attachClientSocketHandlers(socket)

      const sessionId = await new Promise<string>((resolve, reject) => {
        pendingHelloResolve = resolve
        pendingHelloReject = reject
        socket.setTimeout(DEFAULT_ACK_TIMEOUT_MS, () => reject('SESSION_OPEN_TIMEOUT'))
        socket.on('error', (error) => reject(error.message))
        socket.connect(options.port, options.host, () => {
          void writeClientFrame({
            version: SYNRA_PROTOCOL_VERSION,
            type: 'hello',
            sessionId: randomUUID(),
            timestamp: Date.now(),
            appId: SYNRA_APP_ID,
            protocolVersion: SYNRA_PROTOCOL_VERSION,
            capabilities: ['message'],
            payload: {
              token: options.token
            }
          })
        })
      }).catch((reason: unknown) => {
        setSessionClosed(toErrorMessage(reason, 'SESSION_OPEN_FAILED'))
        throw new BridgeError(BRIDGE_ERROR_CODES.timeout, 'Failed to open discovery session.', {
          reason
        })
      })

      session.state = 'open'
      session.sessionId = sessionId
      session.openedAt = Date.now()
      return {
        success: true,
        sessionId,
        state: session.state
      }
    },
    async closeSession(options: DeviceSessionCloseOptions = {}): Promise<DeviceSessionCloseResult> {
      const targetSessionId = options.sessionId ?? session.sessionId
      if (targetSessionId) {
        const inbound = inboundSessions.get(targetSessionId)
        if (inbound && !inbound.socket.destroyed) {
          try {
            await writeSocketFrame(inbound.socket, {
              version: SYNRA_PROTOCOL_VERSION,
              type: 'close',
              sessionId: targetSessionId,
              timestamp: Date.now()
            })
          } catch {
            // ignore
          }
          inbound.socket.destroy()
          inboundSessions.delete(targetSessionId)
        }
      }
      if (clientSocket && !clientSocket.destroyed) {
        try {
          await writeClientFrame({
            version: SYNRA_PROTOCOL_VERSION,
            type: 'close',
            sessionId: targetSessionId,
            timestamp: Date.now()
          })
        } catch {
          // ignore
        }
        clientSocket.destroy()
      }
      setSessionClosed('SESSION_CLOSED_BY_CLIENT')
      return {
        success: true,
        sessionId: targetSessionId
      }
    },
    async sendMessage(
      options: DeviceSessionSendMessageOptions
    ): Promise<DeviceSessionSendMessageResult> {
      const messageId = options.messageId ?? randomUUID()
      if (clientSocket && !clientSocket.destroyed && session.state === 'open') {
        let completed = false
        let attempt = 0
        while (!completed && attempt < MAX_SEND_RETRIES) {
          attempt += 1
          try {
            await new Promise<void>((resolve, reject) => {
              const key = toAckKey(options.sessionId, messageId)
              const timer = setTimeout(() => {
                pendingAcks.delete(key)
                reject(new Error('MESSAGE_ACK_TIMEOUT'))
              }, DEFAULT_ACK_TIMEOUT_MS)
              pendingAcks.set(key, () => {
                clearTimeout(timer)
                resolve()
              })
              void writeClientFrame({
                version: SYNRA_PROTOCOL_VERSION,
                type: 'message',
                sessionId: options.sessionId,
                messageId,
                timestamp: Date.now(),
                payload: {
                  messageType: options.messageType,
                  payload: options.payload
                }
              }).catch((error: unknown) => {
                clearTimeout(timer)
                pendingAcks.delete(key)
                reject(error)
              })
            })
            completed = true
          } catch (error) {
            if (attempt >= MAX_SEND_RETRIES) {
              throw new BridgeError(BRIDGE_ERROR_CODES.timeout, 'Failed to receive message ack.', {
                reason: toErrorMessage(error, 'MESSAGE_ACK_TIMEOUT')
              })
            }
            await new Promise<void>((resolve) => setTimeout(resolve, attempt * 200))
          }
        }
      } else {
        const inbound = inboundSessions.get(options.sessionId)
        if (!inbound || inbound.socket.destroyed) {
          throw new BridgeError(BRIDGE_ERROR_CODES.unsupportedOperation, 'Session is not open.')
        }
        await writeSocketFrame(inbound.socket, {
          version: SYNRA_PROTOCOL_VERSION,
          type: 'message',
          sessionId: options.sessionId,
          messageId,
          timestamp: Date.now(),
          payload: {
            messageType: options.messageType,
            payload: options.payload
          }
        })
        inbound.lastActiveAt = Date.now()
      }

      return {
        success: true,
        messageId,
        sessionId: options.sessionId
      }
    },
    async getSessionState(
      options: DeviceSessionGetStateOptions = {}
    ): Promise<DeviceSessionSnapshot> {
      if (options.sessionId && options.sessionId !== session.sessionId) {
        return {
          state: 'closed',
          sessionId: options.sessionId,
          closedAt: Date.now(),
          lastError: 'SESSION_NOT_FOUND'
        }
      }

      return {
        ...session
      }
    },
    async pullHostEvents(): Promise<DeviceDiscoveryPullHostEventsResult> {
      const events = hostEvents.splice(0, hostEvents.length)
      return { events }
    }
  }
}
