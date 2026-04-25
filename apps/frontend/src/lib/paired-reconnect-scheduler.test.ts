import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test'
import { PAIRED_RECONNECT_DELAYS_MS, PAIRED_RECONNECT_MAX_FAILURES } from './paired-reconnect'
import { PairedReconnectScheduler } from './paired-reconnect-scheduler'

beforeEach(() => {
  vi.clearAllTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

test('backs off 3s / 5s / 10s then gives up after three failed attempts', async () => {
  vi.useFakeTimers()
  const gaveUp: string[] = []
  const cleared: string[] = []
  let ready = false
  let attempts = 0
  const sched = new PairedReconnectScheduler({
    isTransportReady: () => ready,
    tryConnect: async () => {
      attempts += 1
      return false
    },
    onGaveUp: (id) => {
      gaveUp.push(id)
    },
    onCleared: (id) => {
      cleared.push(id)
    }
  })

  sched.onBecameNotReadyShouldSchedule('d1', false)
  expect(attempts).toBe(0)

  await vi.advanceTimersByTimeAsync(PAIRED_RECONNECT_DELAYS_MS[0])
  expect(attempts).toBe(1)
  expect(gaveUp).toEqual([])

  await vi.advanceTimersByTimeAsync(PAIRED_RECONNECT_DELAYS_MS[1])
  expect(attempts).toBe(2)
  expect(gaveUp).toEqual([])

  await vi.advanceTimersByTimeAsync(PAIRED_RECONNECT_DELAYS_MS[2])
  expect(attempts).toBe(3)
  expect(gaveUp).toEqual(['d1'])
  expect(PAIRED_RECONNECT_MAX_FAILURES).toBe(3)
})

test('onBecameReady invokes onCleared', () => {
  const cleared: string[] = []
  const sched = new PairedReconnectScheduler({
    isTransportReady: () => false,
    tryConnect: async () => false,
    onGaveUp: () => undefined,
    onCleared: (id) => {
      cleared.push(id)
    }
  })
  sched.onBecameReady('x')
  expect(cleared).toContain('x')
})

test('does not schedule when isGaveUp is true', async () => {
  vi.useFakeTimers()
  let attempts = 0
  const sched = new PairedReconnectScheduler({
    isTransportReady: () => false,
    tryConnect: async () => {
      attempts += 1
      return false
    },
    onGaveUp: () => undefined,
    onCleared: () => undefined
  })
  sched.onBecameNotReadyShouldSchedule('d1', true)
  await vi.runAllTimersAsync()
  expect(attempts).toBe(0)
})

test('restartAfterManualIfStillDisconnected schedules when still disconnected', async () => {
  vi.useFakeTimers()
  const gaveUp: string[] = []
  let attempts = 0
  const sched = new PairedReconnectScheduler({
    isTransportReady: () => false,
    tryConnect: async () => {
      attempts += 1
      return false
    },
    onGaveUp: (id) => {
      gaveUp.push(id)
    },
    onCleared: () => undefined
  })
  sched.restartAfterManualIfStillDisconnected('d1', false)
  await vi.advanceTimersByTimeAsync(PAIRED_RECONNECT_DELAYS_MS[0])
  expect(attempts).toBe(1)
  await vi.advanceTimersByTimeAsync(PAIRED_RECONNECT_DELAYS_MS[1])
  expect(attempts).toBe(2)
  await vi.advanceTimersByTimeAsync(PAIRED_RECONNECT_DELAYS_MS[2])
  expect(attempts).toBe(3)
  expect(gaveUp).toEqual(['d1'])
})
