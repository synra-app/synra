import { expect, test } from 'vite-plus/test'
import { deriveDeviceCardBadge } from '../src/runtime/derive-device-card-badge'

test('deriveDeviceCardBadge shows spinner while scanning', () => {
  expect(
    deriveDeviceCardBadge({ connectable: false, connectCheckError: 'PROBE_TIMEOUT' }, 'scanning')
  ).toEqual({ tag: 'spinner' })
})

test('deriveDeviceCardBadge success when idle and connectable', () => {
  expect(
    deriveDeviceCardBadge({ connectable: true, connectCheckError: undefined }, 'idle')
  ).toEqual({
    tag: 'glow',
    tone: 'success'
  })
})

test('deriveDeviceCardBadge failure tone for timeout-like errors', () => {
  expect(
    deriveDeviceCardBadge({ connectable: false, connectCheckError: 'PROBE_TIMEOUT' }, 'idle')
  ).toEqual({ tag: 'glow', tone: 'failure' })
})

test('deriveDeviceCardBadge warning tone for soft unreachability', () => {
  expect(
    deriveDeviceCardBadge({ connectable: false, connectCheckError: undefined }, 'idle')
  ).toEqual({
    tag: 'glow',
    tone: 'warning'
  })
})
