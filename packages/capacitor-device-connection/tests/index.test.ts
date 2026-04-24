import { describe, expect, test } from 'vite-plus/test'
import { DeviceConnectionWeb } from '../src/web'

describe('capacitor-device-connection/web', () => {
  test('returns idle transport snapshot by default', async () => {
    const plugin = new DeviceConnectionWeb()
    const snapshot = await plugin.getTransportState()
    expect(snapshot.state).toBe('idle')
    expect(snapshot.transport).toBe('tcp')
  })
})
