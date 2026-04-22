import { beforeEach, describe, expect, test } from 'vite-plus/test'
import { SynraPreferencesWeb } from '../src/web'
import {
  SYNRA_DEVICE_BASIC_INFO_KEY,
  SYNRA_DEVICE_INSTANCE_UUID_KEY,
  SYNRA_PAIRED_DEVICES_KEY,
  SYNRA_PREFERENCES_STORAGE_PREFIX
} from '../src/constants'
import {
  parsePairedDevicesPayload,
  serializePairedDevicesPayload
} from '../src/paired-devices-payload'

describe('capacitor-preferences/web', () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
        setItem: (k: string, v: string) => {
          store.set(k, v)
        },
        removeItem: (k: string) => {
          store.delete(k)
        }
      },
      configurable: true,
      writable: true
    })
  })

  test('get/set/remove roundtrip', async () => {
    const plugin = new SynraPreferencesWeb()
    const key = 'test.key'
    await plugin.set({ key, value: 'hello' })
    const got = await plugin.get({ key })
    expect(got.value).toBe('hello')
    await plugin.remove({ key })
    const after = await plugin.get({ key })
    expect(after.value).toBeNull()
  })

  test('exports canonical device keys', () => {
    expect(SYNRA_DEVICE_INSTANCE_UUID_KEY).toBe('synra.device.instance-uuid')
    expect(SYNRA_DEVICE_BASIC_INFO_KEY).toBe('synra.device.basic-info')
    expect(SYNRA_PAIRED_DEVICES_KEY).toBe('synra.device.paired-peers')
    expect(SYNRA_PREFERENCES_STORAGE_PREFIX).toBe('synra.preferences.')
  })
})

describe('paired-devices-payload', () => {
  test('parse empty and invalid', () => {
    expect(parsePairedDevicesPayload(null).items).toEqual([])
    expect(parsePairedDevicesPayload('').items).toEqual([])
    expect(parsePairedDevicesPayload('not-json').items).toEqual([])
    expect(parsePairedDevicesPayload('{}').items).toEqual([])
  })

  test('roundtrip paired records', () => {
    const payload = {
      version: 1 as const,
      items: [
        {
          deviceId: 'abc',
          displayName: 'Peer',
          pairedAt: 1700000000000,
          lastResolvedHost: '192.168.1.5',
          lastResolvedPort: 32100
        }
      ]
    }
    const serialized = serializePairedDevicesPayload(payload)
    const parsed = parsePairedDevicesPayload(serialized)
    expect(parsed.items).toHaveLength(1)
    expect(parsed.items[0]?.deviceId).toBe('abc')
    expect(parsed.items[0]?.displayName).toBe('Peer')
    expect(parsed.items[0]?.lastResolvedHost).toBe('192.168.1.5')
    expect(parsed.items[0]?.lastResolvedPort).toBe(32100)
  })

  test('parse drops lastResolvedPort when host is missing', () => {
    const raw =
      '{"version":1,"items":[{"deviceId":"device-x","displayName":"Mac","pairedAt":1,"lastResolvedPort":32100}]}'
    const parsed = parsePairedDevicesPayload(raw)
    expect(parsed.items[0]?.lastResolvedHost).toBeUndefined()
    expect(parsed.items[0]?.lastResolvedPort).toBeUndefined()
  })
})
