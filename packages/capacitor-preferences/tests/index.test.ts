import { beforeEach, describe, expect, test } from 'vite-plus/test'
import { SynraPreferencesWeb } from '../src/web'
import { SYNRA_DEVICE_INSTANCE_UUID_KEY, SYNRA_PREFERENCES_STORAGE_PREFIX } from '../src/constants'

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

  test('exports canonical device UUID key', () => {
    expect(SYNRA_DEVICE_INSTANCE_UUID_KEY).toBe('synra.device.instance-uuid')
    expect(SYNRA_PREFERENCES_STORAGE_PREFIX).toBe('synra.preferences.')
  })
})
