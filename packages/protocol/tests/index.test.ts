import { expect, test } from 'vite-plus/test'
import {
  DEFAULT_SYNRA_SCAN_BUDGET_MS,
  PROTOCOL_VERSION,
  PluginBundleTransferAssembly,
  createMessage,
  createProtocolMessage,
  iteratePluginBundleChunks,
  synraDiscoveryTimeoutsFromBudget
} from '../src/index.ts'
import {
  DEVICE_DISPLAY_NAME_CHANGED_EVENT,
  DEVICE_PAIRING_PEER_RESET_EVENT,
  DEVICE_PAIRING_REQUEST_EVENT,
  DEVICE_PAIRING_RESPONSE_EVENT,
  DEVICE_PAIRING_UNPAIR_REQUIRED_EVENT
} from '../src/event-names'
import { LAN_WIRE_EVENT_NAMES, isLanWireEventName } from '../src/lan-events'

test('synraDiscoveryTimeoutsFromBudget splits scan budget', () => {
  const { discoveryTimeoutMs, probeTimeoutMs } = synraDiscoveryTimeoutsFromBudget(
    DEFAULT_SYNRA_SCAN_BUDGET_MS
  )
  expect(discoveryTimeoutMs).toBeGreaterThanOrEqual(200)
  expect(probeTimeoutMs).toBeGreaterThanOrEqual(350)
  expect(discoveryTimeoutMs + probeTimeoutMs).toBeLessThanOrEqual(DEFAULT_SYNRA_SCAN_BUDGET_MS)
})

test('createMessage injects protocol version', () => {
  const message = createMessage({
    requestId: 'req-1',
    replyRequestId: 'req-parent-1',
    event: 'action.selected',
    traceId: 't1',
    sentAt: Date.now(),
    ttlMs: 30_000,
    from: 'mobile-1',
    target: 'pc-1',
    payload: { actionId: 'a1' }
  })

  expect(message.protocolVersion).toBe(PROTOCOL_VERSION)
  expect(message.event).toBe('action.selected')
})

test('createProtocolMessage injects protocol version for runtime message', () => {
  const message = createProtocolMessage({
    requestId: 'req-runtime-1',
    event: 'runtime.request',
    timestamp: Date.now(),
    payload: {
      input: {
        raw: 'https://github.com/synra'
      },
      requestedAt: Date.now()
    }
  })

  expect(message.protocolVersion).toBe(PROTOCOL_VERSION)
  expect(message.event).toBe('runtime.request')
})

test('runtime.finished failed status carries structured error', () => {
  const finished = createProtocolMessage({
    requestId: 'req-runtime-2',
    event: 'runtime.finished',
    timestamp: Date.now(),
    payload: {
      status: 'failed' as const,
      finishedAt: Date.now(),
      error: {
        code: 'RUNTIME_EXECUTION_FAILED' as const,
        message: 'Plugin execution crashed.'
      }
    }
  })

  const payload = finished.payload as { status?: string; error?: { code?: string } }
  expect(payload.status).toBe('failed')
  expect(payload.error?.code).toBe('RUNTIME_EXECUTION_FAILED')
})

test('plugin-bundle file transfer chunks round-trip through assembly', () => {
  const transferId = 't1'
  const encoder = new TextEncoder()
  const raw = encoder.encode('hello-world-payload')
  const chunks = [
    ...iteratePluginBundleChunks({
      transferId,
      buffer: raw,
      chunkSize: 4,
      pluginId: 'p1',
      version: '1.0.0'
    })
  ]
  expect(chunks.length).toBeGreaterThan(0)

  const asm = new PluginBundleTransferAssembly(transferId)
  for (const c of chunks) {
    expect(asm.push(c)).toBeUndefined()
  }
  expect(asm.isComplete()).toBe(true)
  const snap = asm.getProgressSnapshot()
  expect(snap.chunksReceived).toBe(chunks.length)
  expect(snap.totalChunks).toBe(chunks[0]?.totalChunks)
  expect(snap.bytesReceived).toBeGreaterThan(0)
  const decoded = new TextDecoder().decode(asm.concat())
  expect(decoded).toBe('hello-world-payload')
})

test('createProtocolMessage supports file.transfer.chunk', () => {
  const m = createProtocolMessage({
    requestId: 'r1',
    event: 'file.transfer.chunk',
    timestamp: Date.now(),
    payload: {
      transferId: 'tf-1',
      kind: 'plugin-bundle',
      pluginId: 'pi',
      version: '1',
      chunkIndex: 0,
      totalChunks: 1,
      chunkBase64: Buffer.from('x').toString('base64')
    }
  })
  expect(m.event).toBe('file.transfer.chunk')
  expect(m.payload.kind).toBe('plugin-bundle')
})

test('LAN wire event whitelist stays aligned with shared constants', () => {
  expect(LAN_WIRE_EVENT_NAMES).toEqual([
    DEVICE_DISPLAY_NAME_CHANGED_EVENT,
    DEVICE_PAIRING_REQUEST_EVENT,
    DEVICE_PAIRING_RESPONSE_EVENT,
    DEVICE_PAIRING_PEER_RESET_EVENT,
    DEVICE_PAIRING_UNPAIR_REQUIRED_EVENT
  ])
  expect(new Set(LAN_WIRE_EVENT_NAMES).size).toBe(LAN_WIRE_EVENT_NAMES.length)
  expect(isLanWireEventName(DEVICE_PAIRING_REQUEST_EVENT)).toBe(true)
  expect(isLanWireEventName('custom.chat.message')).toBe(false)
})
