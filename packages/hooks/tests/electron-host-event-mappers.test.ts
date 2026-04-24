import { describe, expect, test } from 'vite-plus/test'
import type { HostEvent } from '@synra/capacitor-device-connection'
import {
  mapLanWireEventReceivedHostEvent,
  mapMessageTypeFromHostEvent,
  mapTransportClosedHostEvent,
  mapTransportOpenedHostEvent,
  mapTransportErrorHostEvent
} from '../src/runtime/adapters/electron-host-event-mappers'

describe('electron host event mappers', () => {
  test('maps transport.opened payload and fallback remote', () => {
    const event: HostEvent = {
      id: 1,
      timestamp: Date.now(),
      type: 'transport.opened',
      remote: '10.0.0.102:32100',
      deviceId: 'device-a',
      payload: {
        deviceId: 'device-a',
        direction: 'inbound',
        host: '10.0.0.102',
        port: 32100,
        displayName: 'Android'
      },
      transport: 'tcp'
    }

    expect(mapTransportOpenedHostEvent(event)).toEqual({
      deviceId: 'device-a',
      direction: 'inbound',
      host: '10.0.0.102',
      port: 32100,
      displayName: 'Android',
      incomingSynraConnectPayload: undefined,
      transport: 'tcp'
    })
  })

  test('maps transport.lan.event.received', () => {
    const event: HostEvent = {
      id: 6,
      timestamp: Date.now(),
      type: 'transport.lan.event.received',
      remote: '10.0.0.2:32100',
      payload: {
        requestId: 'r1',
        sourceDeviceId: 'peer-1',
        targetDeviceId: 'device-self',
        eventName: 'pairing.request',
        payload: { requestId: 'r1' }
      },
      transport: 'tcp'
    }
    expect(mapLanWireEventReceivedHostEvent(event)).toEqual({
      requestId: 'r1',
      sourceDeviceId: 'peer-1',
      targetDeviceId: 'device-self',
      replyToRequestId: undefined,
      eventName: 'pairing.request',
      eventPayload: { requestId: 'r1' },
      transport: 'tcp'
    })
  })

  test('maps closed and heartbeat timeout events', () => {
    const closed: HostEvent = {
      id: 2,
      timestamp: Date.now(),
      type: 'transport.closed',
      remote: '10.0.0.102:32100',
      deviceId: 'device-a',
      payload: { reason: 'peer-closed' },
      transport: 'tcp'
    }
    const timeout: HostEvent = {
      id: 3,
      timestamp: Date.now(),
      type: 'host.heartbeat.timeout',
      remote: '10.0.0.102:32100',
      deviceId: 'device-a',
      code: 'INBOUND_HEARTBEAT_TIMEOUT',
      transport: 'tcp'
    }

    expect(mapTransportClosedHostEvent(closed)?.reason).toBe('peer-closed')
    expect(mapTransportClosedHostEvent(timeout)).toEqual({
      deviceId: 'device-a',
      reason: 'INBOUND_HEARTBEAT_TIMEOUT',
      transport: 'tcp'
    })
  })

  test('maps transport errors and message type', () => {
    const transportError: HostEvent = {
      id: 4,
      timestamp: Date.now(),
      type: 'transport.error',
      remote: '10.0.0.102:32100',
      deviceId: 'device-a',
      code: 'SOCKET_ERROR',
      payload: { message: 'broken pipe' },
      transport: 'tcp'
    }
    const messageReceived: HostEvent = {
      id: 5,
      timestamp: Date.now(),
      type: 'transport.message.received',
      remote: '10.0.0.102:32100',
      deviceId: 'device-a',
      messageType: 'custom.chat.text',
      transport: 'tcp'
    }

    expect(mapTransportErrorHostEvent(transportError)).toEqual({
      deviceId: 'device-a',
      code: 'SOCKET_ERROR',
      message: 'broken pipe',
      transport: 'tcp'
    })
    expect(mapMessageTypeFromHostEvent(messageReceived)).toBe('custom.chat.text')
  })
})
