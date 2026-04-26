import { afterEach, describe, expect, test, vi } from 'vite-plus/test'
import { LanDiscoveryElectron } from '../src/electron'

type BridgeTarget = typeof globalThis & {
  __synraCapElectron?: {
    invoke?: (method: string, payload: unknown) => Promise<unknown>
    onHostEvent?: (
      listener: (event: { type: string; payload?: unknown; timestamp?: number }) => void
    ) => () => void
  }
}

const previousBridge = (globalThis as BridgeTarget).__synraCapElectron

afterEach(() => {
  ;(globalThis as BridgeTarget).__synraCapElectron = previousBridge
})

describe('capacitor-lan-discovery/electron', () => {
  test('subscribes host events when only listener is added', async () => {
    let hostListener:
      | ((event: { type: string; payload?: unknown; timestamp?: number; remote?: string }) => void)
      | undefined
    ;(globalThis as BridgeTarget).__synraCapElectron = {
      invoke: vi.fn(async () => ({ state: 'idle', devices: [] })),
      onHostEvent: (listener) => {
        hostListener = listener
        return () => {
          hostListener = undefined
        }
      }
    }

    const plugin = new LanDiscoveryElectron()
    const seenDeviceIds: string[] = []
    await plugin.addListener('deviceFound', (event) => {
      seenDeviceIds.push(event.device.deviceId)
    })

    expect(hostListener).toBeTypeOf('function')
    hostListener?.({
      type: 'host.member.online',
      timestamp: 111,
      payload: {
        deviceId: 'device-peer',
        displayName: 'Peer Device',
        host: '10.0.0.2',
        port: 32100,
        source: 'transport',
        connectable: true
      }
    })

    expect(seenDeviceIds).toEqual(['device-peer'])
  })
})
