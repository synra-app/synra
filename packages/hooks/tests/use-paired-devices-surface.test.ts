import { describe, expect, test } from 'vite-plus/test'
import type { DiscoveredDevice } from '@synra/capacitor-lan-discovery'
import type { SynraPairedDeviceRecord } from '@synra/capacitor-preferences'
import { pairedSurfaceFromRecordAndLive } from '../src/hooks/use-paired-devices'

function record(overrides: Partial<SynraPairedDeviceRecord>): SynraPairedDeviceRecord {
  return {
    deviceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    displayName: 'Stored Peer',
    pairedAt: 1_700_000_000_000,
    lastResolvedHost: '192.168.1.20',
    lastResolvedPort: 32100,
    ...overrides
  }
}

function livePeer(overrides: Partial<DiscoveredDevice>): DiscoveredDevice {
  return {
    deviceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    name: 'iPhone',
    ipAddress: '',
    connectable: false,
    lastSeenAt: Date.now(),
    discoveredAt: Date.now(),
    source: 'mdns',
    ...overrides
  }
}

describe('pairedSurfaceFromRecordAndLive', () => {
  test('prefers stored displayName and host over noisy discovery row', () => {
    const surface = pairedSurfaceFromRecordAndLive(record({}), livePeer({}))
    expect(surface.name).toBe('Stored Peer')
    expect(surface.ipAddress).toBe('192.168.1.20')
    expect(surface.port).toBe(32100)
  })

  test('uses live host only when storage has no host', () => {
    const surface = pairedSurfaceFromRecordAndLive(
      record({ lastResolvedHost: undefined, lastResolvedPort: undefined }),
      livePeer({ ipAddress: '10.0.0.5', port: 32100 })
    )
    expect(surface.ipAddress).toBe('10.0.0.5')
    expect(surface.port).toBe(32100)
  })

  test('falls back to live name when displayName empty', () => {
    const surface = pairedSurfaceFromRecordAndLive(
      record({ displayName: '   ' }),
      livePeer({ name: 'Lan Name' })
    )
    expect(surface.name).toBe('Lan Name')
  })
})
