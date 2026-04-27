import { expect, test } from 'vite-plus/test'
import type { DiscoveredDevice } from '@synra/capacitor-lan-discovery'
import {
  filterAdmittedDiscoveredDevices,
  shouldKeepDiscoveredDevice
} from '../src/runtime/discovery-admission'

const now = 1_700_000_000_000

test('shouldKeepDiscoveredDevice rejects mdns-only candidates without handshake proof', () => {
  const mdnsOnly: DiscoveredDevice = {
    deviceId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    name: '10.0.0.1',
    ipAddress: '10.0.0.1',
    port: 32100,
    source: 'mdns',
    connectable: true,
    discoveredAt: now,
    lastSeenAt: now
  }
  expect(shouldKeepDiscoveredDevice(mdnsOnly)).toBe(false)
})

test('shouldKeepDiscoveredDevice accepts probe rows with connectCheckAt', () => {
  const probed: DiscoveredDevice = {
    deviceId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    name: 'Desk',
    ipAddress: '10.0.0.2',
    port: 32100,
    source: 'probe',
    connectable: true,
    connectCheckAt: now,
    discoveredAt: now,
    lastSeenAt: now
  }
  expect(shouldKeepDiscoveredDevice(probed)).toBe(true)
})

test('filterAdmittedDiscoveredDevices drops mdns-only rows', () => {
  const rows: DiscoveredDevice[] = [
    {
      deviceId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      name: '10.0.0.1',
      ipAddress: '10.0.0.1',
      source: 'mdns',
      connectable: true,
      discoveredAt: now,
      lastSeenAt: now
    },
    {
      deviceId: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
      name: 'Ok',
      ipAddress: '10.0.0.2',
      source: 'probe',
      connectable: true,
      connectCheckAt: 1,
      discoveredAt: now,
      lastSeenAt: now
    }
  ]
  const out = filterAdmittedDiscoveredDevices(rows)
  expect(out).toHaveLength(1)
  expect(out[0]?.source).toBe('probe')
})
