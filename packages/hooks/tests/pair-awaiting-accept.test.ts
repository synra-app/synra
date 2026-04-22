import { expect, test } from 'vite-plus/test'
import {
  getPairAwaitingAcceptDeviceIds,
  setPairAwaitingAccept
} from '../src/runtime/pair-awaiting-accept'

test('setPairAwaitingAccept toggles device id in reactive set', () => {
  setPairAwaitingAccept('dev-a', true)
  expect(getPairAwaitingAcceptDeviceIds().value.has('dev-a')).toBe(true)
  setPairAwaitingAccept('dev-a', false)
  expect(getPairAwaitingAcceptDeviceIds().value.has('dev-a')).toBe(false)
})
