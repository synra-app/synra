import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test'
import {
  parsePairedDevicesPayload,
  serializePairedDevicesPayload
} from '@synra/capacitor-preferences'
import { upsertPairedDeviceRecord } from './paired-devices-storage'

let storedValue: string | null = null

vi.mock('@synra/capacitor-preferences', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@synra/capacitor-preferences')>()
  return {
    ...actual,
    SynraPreferences: {
      get: vi.fn(async () => ({ value: storedValue })),
      set: vi.fn(async (opts: { value: string }) => {
        storedValue = opts.value
      })
    }
  }
})

describe('upsertPairedDeviceRecord merge', () => {
  beforeEach(() => {
    storedValue = serializePairedDevicesPayload({
      version: 1,
      items: [
        {
          deviceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          displayName: 'GoodName',
          pairedAt: 1_700_000_000_000,
          lastResolvedHost: '192.168.1.10',
          lastResolvedPort: 32100
        }
      ]
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('preserves displayName and host when incoming host invalid and displayName blank', async () => {
    await upsertPairedDeviceRecord({
      deviceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      displayName: '   ',
      pairedAt: 1_700_000_000_000,
      lastResolvedHost: '',
      lastResolvedPort: 9
    })
    const items = parsePairedDevicesPayload(storedValue).items
    expect(items[0]?.displayName).toBe('GoodName')
    expect(items[0]?.lastResolvedHost).toBe('192.168.1.10')
    expect(items[0]?.lastResolvedPort).toBe(32100)
  })

  test('applies new displayName when incoming host is valid IPv4', async () => {
    await upsertPairedDeviceRecord({
      deviceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      displayName: 'Renamed',
      pairedAt: 1_700_000_000_000,
      lastResolvedHost: '10.0.0.2',
      lastResolvedPort: 32100
    })
    const items = parsePairedDevicesPayload(storedValue).items
    expect(items[0]?.displayName).toBe('Renamed')
    expect(items[0]?.lastResolvedHost).toBe('10.0.0.2')
  })
})
