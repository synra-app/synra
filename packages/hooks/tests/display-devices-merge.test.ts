import { expect, test } from 'vite-plus/test'
import type { DiscoveredDevice } from '@synra/capacitor-lan-discovery'
import type { SynraPairedDeviceRecord } from '@synra/capacitor-preferences'
import { mergePairedAndDiscoveredDevices } from '../src/runtime/display-devices-merge'
import type { RuntimeOpenTransportLink } from '../src/types'

const now = 1_700_000_000_000

function peer(
  overrides: Partial<DiscoveredDevice> & Pick<DiscoveredDevice, 'deviceId' | 'name' | 'ipAddress'>
): DiscoveredDevice {
  return {
    source: 'mdns',
    connectable: true,
    discoveredAt: now,
    lastSeenAt: now,
    ...overrides
  }
}

test('merge lists paired first then unpaired by lastSeenAt', () => {
  const paired: SynraPairedDeviceRecord[] = [
    { deviceId: 'p-old', displayName: 'Old', pairedAt: 100 },
    { deviceId: 'p-new', displayName: 'New', pairedAt: 200 }
  ]
  const discovered: DiscoveredDevice[] = [
    peer({ deviceId: 'p-new', name: 'Live New', ipAddress: '10.0.0.2', lastSeenAt: 500 }),
    peer({ deviceId: 'u1', name: 'Unpaired', ipAddress: '10.0.0.9', lastSeenAt: 400 }),
    peer({ deviceId: 'p-old', name: 'Live Old', ipAddress: '10.0.0.1', lastSeenAt: 300 })
  ]
  const merged = mergePairedAndDiscoveredDevices(
    paired,
    discovered,
    new Set(['p-old', 'p-new']),
    []
  )
  expect(merged.map((row) => row.deviceId)).toEqual(['p-new', 'p-old', 'u1'])
  expect(merged[0]?.isPaired).toBe(true)
  expect(merged[0]?.name).toBe('New')
  expect(merged[1]?.name).toBe('Old')
  expect(merged[2]?.isPaired).toBe(false)
})

test('merge keeps offline paired row when peer missing from discovery', () => {
  const paired: SynraPairedDeviceRecord[] = [
    {
      deviceId: 'gone',
      displayName: 'Away',
      pairedAt: 50,
      lastResolvedHost: '10.0.0.8',
      lastResolvedPort: 32100
    }
  ]
  const merged = mergePairedAndDiscoveredDevices(paired, [], new Set(), [])
  expect(merged).toHaveLength(1)
  expect(merged[0]?.deviceId).toBe('gone')
  expect(merged[0]?.connectable).toBe(false)
  expect(merged[0]?.isPaired).toBe(true)
  expect(merged[0]?.port).toBe(32100)
})

test('merge offline paired omits port when host is missing', () => {
  const paired: SynraPairedDeviceRecord[] = [
    { deviceId: 'x', displayName: 'NoIp', pairedAt: 1, lastResolvedPort: 32100 }
  ]
  const merged = mergePairedAndDiscoveredDevices(paired, [], new Set(), [])
  expect(merged[0]?.ipAddress).toBe('')
  expect(merged[0]?.port).toBeUndefined()
})

test('merge paired fills ip and port from open transport link when storage host is empty', () => {
  const paired: SynraPairedDeviceRecord[] = [
    { deviceId: 'd-android', displayName: 'android', pairedAt: 1 }
  ]
  const links: RuntimeOpenTransportLink[] = [
    {
      deviceId: 'd-android',
      transport: 'ready',
      app: 'connected',
      host: '192.168.11.4',
      port: 32100,
      openedAt: 1,
      lastActiveAt: 1
    }
  ]
  const merged = mergePairedAndDiscoveredDevices(paired, [], new Set(['d-android']), links)
  expect(merged[0]?.ipAddress).toBe('192.168.11.4')
  expect(merged[0]?.port).toBe(32100)
  expect(merged[0]?.name).toBe('android')
})

test('merge reconciles paired id with discovery id drift by host:port (Electron embedded probe)', () => {
  const paired: SynraPairedDeviceRecord[] = [
    {
      deviceId: 'device-canonical-android',
      displayName: 'Phone',
      pairedAt: 200,
      lastResolvedHost: '192.168.1.5',
      lastResolvedPort: 32100
    }
  ]
  const discovered: DiscoveredDevice[] = [
    peer({
      deviceId: 'mdns-ghost-candidate',
      name: 'Phone',
      ipAddress: '192.168.1.5',
      port: 32100,
      lastSeenAt: 500
    })
  ]
  const merged = mergePairedAndDiscoveredDevices(
    paired,
    discovered,
    new Set(['device-canonical-android']),
    []
  )
  expect(merged).toHaveLength(1)
  expect(merged[0]?.deviceId).toBe('device-canonical-android')
  expect(merged[0]?.isPaired).toBe(true)
  expect(merged[0]?.ipAddress).toBe('192.168.1.5')
  expect(merged[0]?.name).toBe('Phone')
  expect(merged[0]?.connectable).toBe(true)
})
