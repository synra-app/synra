import { expect, test } from 'vite-plus/test'
import { PROTOCOL_VERSION, createMessage, createProtocolMessage } from '../src/index.ts'

test('createMessage injects protocol version', () => {
  const message = createMessage({
    messageId: 'm1',
    sessionId: 's1',
    traceId: 't1',
    type: 'action.selected',
    sentAt: Date.now(),
    ttlMs: 30_000,
    fromDeviceId: 'mobile-1',
    toDeviceId: 'pc-1',
    payload: { actionId: 'a1' }
  })

  expect(message.protocolVersion).toBe(PROTOCOL_VERSION)
})

test('createProtocolMessage injects protocol version for runtime message', () => {
  const message = createProtocolMessage({
    messageId: 'm-runtime-1',
    sessionId: 's1',
    timestamp: Date.now(),
    type: 'runtime.request',
    payload: {
      input: {
        raw: 'https://github.com/synra'
      },
      requestedAt: Date.now()
    }
  })

  expect(message.protocolVersion).toBe(PROTOCOL_VERSION)
  expect(message.type).toBe('runtime.request')
})

test('runtime.finished failed status carries structured error', () => {
  const finished = createProtocolMessage({
    messageId: 'm-runtime-2',
    sessionId: 's1',
    timestamp: Date.now(),
    type: 'runtime.finished',
    payload: {
      status: 'failed' as const,
      finishedAt: Date.now(),
      error: {
        code: 'RUNTIME_EXECUTION_FAILED' as const,
        message: 'Plugin execution crashed.'
      }
    }
  })

  expect(finished.payload.status).toBe('failed')
  expect(finished.payload.error?.code).toBe('RUNTIME_EXECUTION_FAILED')
})
