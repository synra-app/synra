import { expect, test } from 'vite-plus/test'
import {
  DEFAULT_RETRY_POLICY,
  MessageDeduper,
  TransportSendError,
  createLoopbackTransportPair,
  getRetryDelayMs
} from '../src/index.ts'

function createLegacyMessage(requestId: string) {
  return {
    protocolVersion: '1.0' as const,
    requestId,
    replyRequestId: undefined,
    event: 'action.selected' as const,
    traceId: 't1',
    sentAt: Date.now(),
    ttlMs: 15_000,
    from: 'mobile',
    target: 'pc',
    payload: { actionId: 'a1' }
  }
}

test('getRetryDelayMs uses exponential backoff with cap', () => {
  const first = getRetryDelayMs(1, DEFAULT_RETRY_POLICY)
  const third = getRetryDelayMs(3, DEFAULT_RETRY_POLICY)
  const tenth = getRetryDelayMs(10, DEFAULT_RETRY_POLICY)

  expect(first).toBe(500)
  expect(third).toBe(2_000)
  expect(tenth).toBe(2_000)
})

test('MessageDeduper no longer matches after expiration', () => {
  const deduper = new MessageDeduper(100)
  const startAt = 1_000

  deduper.remember('m1', startAt)
  expect(deduper.has('m1', startAt + 50)).toBe(true)
  expect(deduper.has('m1', startAt + 101)).toBe(false)
})

test('loopback transport delivers message to peer listener', async () => {
  const [sender, receiver] = createLoopbackTransportPair()
  const seenRequestIds: string[] = []
  receiver.onMessage((message) => {
    seenRequestIds.push(message.requestId)
  })

  const message = createLegacyMessage('m-loop-1')

  await sender.send(message)
  expect(seenRequestIds).toEqual(['m-loop-1'])
})

test('loopback transport dedupes repeated message id', async () => {
  const [sender, receiver] = createLoopbackTransportPair()
  let receivedCount = 0
  receiver.onMessage(() => {
    receivedCount += 1
  })

  const message = createLegacyMessage('m-loop-dup')

  await sender.send(message)
  await sender.send(message)

  expect(receivedCount).toBe(1)
})

test('loopback transport throws unreachable error without peer listener', async () => {
  const [sender] = createLoopbackTransportPair()
  const message = createLegacyMessage('m-loop-err')

  await expect(sender.send(message)).rejects.toBeInstanceOf(TransportSendError)
  await expect(sender.send(message)).rejects.toMatchObject({
    code: 'TRANSPORT_UNREACHABLE'
  })
})
