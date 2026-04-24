import { describe, expect, test } from 'vite-plus/test'
import { discoveredDeviceFromHostEvent, lostDeviceFromHostEvent } from '../src/host-event-device'

describe('host-event-device mapper', () => {
  test('maps host.member.online to discovered device', () => {
    const mapped = discoveredDeviceFromHostEvent({
      type: 'host.member.online',
      timestamp: 123456,
      remote: '10.0.0.12:32100',
      payload: {
        deviceId: 'device-abc',
        displayName: 'Android',
        host: '10.0.0.102',
        port: 32100,
        source: 'probe',
        connectable: true
      }
    })

    expect(mapped).toEqual({
      deviceId: 'device-abc',
      name: 'Android',
      ipAddress: '10.0.0.102',
      port: 32100,
      source: 'probe',
      connectable: true,
      connectCheckAt: 123456,
      discoveredAt: 123456,
      lastSeenAt: 123456
    })
  })

  test('maps transport.opened with remote host fallback', () => {
    const mapped = discoveredDeviceFromHostEvent(
      {
        type: 'transport.opened',
        remote: '10.0.0.12:32100',
        payload: {
          deviceId: 'device-peer',
          displayName: 'Peer'
        }
      },
      999
    )

    expect(mapped).toEqual({
      deviceId: 'device-peer',
      name: 'Peer',
      ipAddress: '10.0.0.12',
      port: undefined,
      source: 'session',
      connectable: true,
      connectCheckAt: 999,
      discoveredAt: 999,
      lastSeenAt: 999
    })
  })

  test('maps host.member.offline to lost device payload', () => {
    const mapped = lostDeviceFromHostEvent({
      type: 'host.member.offline',
      payload: {
        deviceId: 'device-offline',
        sourceHostIp: '10.0.0.77'
      }
    })

    expect(mapped).toEqual({
      deviceId: 'device-offline',
      ipAddress: '10.0.0.77'
    })
  })
})
