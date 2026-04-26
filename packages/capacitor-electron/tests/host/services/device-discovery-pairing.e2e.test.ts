import { createServer } from 'node:net'
import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, test } from 'vite-plus/test'
import type { DeviceDiscoveryHostEvent } from '../../../src/shared/protocol/types'
import { createHostEventBus } from '../../../src/host/services/device-discovery/events/host-event-bus'
import type { InboundHostTransport } from '../../../src/host/services/device-discovery/session/inbound-host-transport'
import { createInboundHostTransport } from '../../../src/host/services/device-discovery/session/inbound-host-transport'
import type { OutboundClientTransport } from '../../../src/host/services/device-discovery/session/outbound-client-session'
import { createOutboundClientTransport } from '../../../src/host/services/device-discovery/session/outbound-client-session'

async function allocateRandomTcpPort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  await new Promise<void>((resolve) => server.close(() => resolve()))
  if (port <= 0) {
    throw new Error('Failed to allocate random TCP port.')
  }
  return port
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

type RuntimePair = {
  port: number
  inbound: InboundHostTransport
  outbound: OutboundClientTransport
  inboundEvents: DeviceDiscoveryHostEvent[]
  outboundEvents: DeviceDiscoveryHostEvent[]
}

async function createRuntimePair(): Promise<RuntimePair> {
  const inboundEvents: DeviceDiscoveryHostEvent[] = []
  const outboundEvents: DeviceDiscoveryHostEvent[] = []
  const port = await allocateRandomTcpPort()
  const inbound = createInboundHostTransport({
    port,
    enableUdpResponder: false,
    enableBonjour: false,
    eventBus: createHostEventBus((event) => inboundEvents.push(event)),
    resolveLocalDeviceUuid: () => '11111111-1111-4111-8111-111111111111'
  })
  await inbound.start()
  const outbound = createOutboundClientTransport({
    eventBus: createHostEventBus((event) => outboundEvents.push(event)),
    resolveLocalDeviceUuid: () => '22222222-2222-4222-8222-222222222222'
  })
  return { port, inbound, outbound, inboundEvents, outboundEvents }
}

const runtimePairs: RuntimePair[] = []

afterEach(async () => {
  while (runtimePairs.length > 0) {
    const pair = runtimePairs.pop()
    if (!pair) {
      continue
    }
    await pair.outbound.close().catch(() => undefined)
    await pair.inbound.stop().catch(() => undefined)
  }
})

describe('host/services/device-discovery pairing handshake e2e', () => {
  const hostUuid = '11111111-1111-4111-8111-111111111111'
  const peerUuid = '22222222-2222-4222-8222-222222222222'

  test('inbound fresh keeps link and returns fresh connectAck hint', async () => {
    const pair = await createRuntimePair()
    runtimePairs.push(pair)

    await pair.outbound.open({
      deviceId: hostUuid,
      host: '127.0.0.1',
      port: pair.port,
      connectType: 'fresh'
    })

    const outboundOpened = pair.outboundEvents.find((event) => event.type === 'transport.opened')
    expect(outboundOpened).toBeTruthy()
    const outboundPayload =
      outboundOpened?.payload && typeof outboundOpened.payload === 'object'
        ? (outboundOpened.payload as Record<string, unknown>)
        : {}
    const ackPayload =
      outboundPayload.connectAckPayload && typeof outboundPayload.connectAckPayload === 'object'
        ? (outboundPayload.connectAckPayload as Record<string, unknown>)
        : {}
    expect(ackPayload.connectType).toBe('fresh')
    expect(ackPayload.hostListsPeerAsPaired).toBe(false)

    const inboundOpened = pair.inboundEvents.find((event) => event.type === 'transport.opened')
    expect(inboundOpened).toBeTruthy()
  })

  test('paired connect to unpaired host is silently rejected with fresh hint', async () => {
    const pair = await createRuntimePair()
    runtimePairs.push(pair)

    await pair.outbound.open({
      deviceId: hostUuid,
      host: '127.0.0.1',
      port: pair.port,
      connectType: 'paired'
    })

    const outboundOpened = pair.outboundEvents.find((event) => event.type === 'transport.opened')
    expect(outboundOpened).toBeTruthy()
    const outboundPayload =
      outboundOpened?.payload && typeof outboundOpened.payload === 'object'
        ? (outboundOpened.payload as Record<string, unknown>)
        : {}
    const ackPayload =
      outboundPayload.connectAckPayload && typeof outboundPayload.connectAckPayload === 'object'
        ? (outboundPayload.connectAckPayload as Record<string, unknown>)
        : {}
    expect(ackPayload.connectType).toBe('fresh')
    expect(ackPayload.hostListsPeerAsPaired).toBe(false)

    await delay(80)
    const outboundState = await pair.outbound.getState({ target: hostUuid })
    expect(outboundState.state).toBe('closed')

    const inboundOpened = pair.inboundEvents.find((event) => event.type === 'transport.opened')
    expect(inboundOpened).toBeUndefined()
  })

  test('host send path always uses local UUID as from', async () => {
    const pair = await createRuntimePair()
    runtimePairs.push(pair)

    await pair.outbound.open({
      deviceId: hostUuid,
      host: '127.0.0.1',
      port: pair.port,
      connectType: 'fresh'
    })

    await pair.outbound.sendMessage({
      requestId: randomUUID(),
      event: 'custom.chat.text',
      from: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      target: hostUuid,
      payload: { body: 'hello' }
    })

    const inboundMessage = pair.inboundEvents.find(
      (event) => event.type === 'transport.message.received'
    )
    expect(inboundMessage).toBeTruthy()
    expect(inboundMessage?.from).toBe(peerUuid)
  })
})
