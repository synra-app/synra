import { describe, expect, test } from 'vite-plus/test'
import type { HostEvent } from '@synra/capacitor-device-connection'
import {
  mapLanWireEventReceivedHostEvent,
  mapMessageTypeFromHostEvent,
  mapSessionClosedHostEvent,
  mapSessionOpenedHostEvent,
  mapTransportErrorHostEvent
} from '../src/runtime/adapters/electron-host-event-mappers'

describe('electron host event mappers', () => {
  test('maps transport.session.opened payload and fallback remote', () => {
    const event: HostEvent = {
      id: 1,
      timestamp: Date.now(),
      type: 'transport.session.opened',
      remote: '10.0.0.102:32100',
      sessionId: 's1',
      payload: {
        deviceId: 'device-a',
        direction: 'inbound',
        host: '10.0.0.102',
        port: 32100,
        displayName: 'Android'
      },
      transport: 'tcp'
    }

    expect(mapSessionOpenedHostEvent(event)).toEqual({
      sessionId: 's1',
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
      sessionId: 's9',
      payload: {
        eventName: 'pairing.request',
        payload: { requestId: 'r1' },
        fromDeviceId: 'peer-1'
      },
      transport: 'tcp'
    }
    expect(mapLanWireEventReceivedHostEvent(event)).toEqual({
      sessionId: 's9',
      eventName: 'pairing.request',
      eventPayload: { requestId: 'r1' },
      fromDeviceId: 'peer-1',
      transport: 'tcp'
    })
  })

  test('maps closed and heartbeat timeout events', () => {
    const closed: HostEvent = {
      id: 2,
      timestamp: Date.now(),
      type: 'transport.session.closed',
      remote: '10.0.0.102:32100',
      sessionId: 's1',
      payload: { reason: 'peer-closed' },
      transport: 'tcp'
    }
    const timeout: HostEvent = {
      id: 3,
      timestamp: Date.now(),
      type: 'host.heartbeat.timeout',
      remote: '10.0.0.102:32100',
      sessionId: 's2',
      code: 'INBOUND_HEARTBEAT_TIMEOUT',
      transport: 'tcp'
    }

    expect(mapSessionClosedHostEvent(closed)?.reason).toBe('peer-closed')
    expect(mapSessionClosedHostEvent(timeout)).toEqual({
      sessionId: 's2',
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
      sessionId: 's3',
      code: 'SOCKET_ERROR',
      payload: { message: 'broken pipe' },
      transport: 'tcp'
    }
    const messageReceived: HostEvent = {
      id: 5,
      timestamp: Date.now(),
      type: 'transport.message.received',
      remote: '10.0.0.102:32100',
      sessionId: 's3',
      messageType: 'custom.chat.text',
      transport: 'tcp'
    }

    expect(mapTransportErrorHostEvent(transportError)).toEqual({
      sessionId: 's3',
      code: 'SOCKET_ERROR',
      message: 'broken pipe',
      transport: 'tcp'
    })
    expect(mapMessageTypeFromHostEvent(messageReceived)).toBe('custom.chat.text')
  })
})
