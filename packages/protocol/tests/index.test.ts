import { expect, test } from 'vite-plus/test'
import { PROTOCOL_VERSION, createMessage, createProtocolMessage } from '../src/index.ts'
import {
  DEVICE_DISPLAY_NAME_CHANGED_EVENT,
  DEVICE_PAIRING_PEER_RESET_EVENT,
  DEVICE_PAIRING_REQUEST_EVENT,
  DEVICE_PAIRING_RESPONSE_EVENT,
  DEVICE_PAIRING_UNPAIR_REQUIRED_EVENT
} from '../src/event-names'
import { LAN_WIRE_EVENT_NAMES, isLanWireEventName } from '../src/lan-events'

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
