import { describe, expect, test } from 'vite-plus/test'
import { DeviceConnectionWeb } from '../src/web'

describe('capacitor-device-connection/web', () => {
  test('returns idle session snapshot by default', async () => {
    const plugin = new DeviceConnectionWeb()
    const snapshot = await plugin.getSessionState()
    expect(snapshot.state).toBe('idle')
    expect(snapshot.transport).toBe('tcp')
  })
})
