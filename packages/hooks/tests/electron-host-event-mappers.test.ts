import { describe, expect, test } from 'vite-plus/test'
import type { HostEvent } from '@synra/capacitor-device-connection'
import { DEVICE_CONNECTION_TRANSPORT_ERROR_CODES } from '@synra/capacitor-device-connection'
import { DEVICE_PAIRING_REQUEST_EVENT } from '@synra/protocol'
import {
  mapLanWireEventReceivedHostEvent,
  mapMessageTypeFromHostEvent,
  mapTransportClosedHostEvent,
  mapTransportOpenedHostEvent,
  mapTransportErrorHostEvent
} from '../src/runtime/adapters/electron-host-event-mappers'

describe('electron host event mappers', () => {
  test('maps transport.opened payload', () => {
    const event: HostEvent = {
      id: 1,
      timestamp: Date.now(),
      type: 'transport.opened',
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

  test('maps transport.lan.event.received (host uses eventPayload)', () => {
    const event: HostEvent = {
      id: 6,
      timestamp: Date.now(),
      type: 'transport.lan.event.received',
      payload: {
        requestId: 'r1',
        from: 'peer-1',
        target: 'device-self',
        event: DEVICE_PAIRING_REQUEST_EVENT,
        payload: { requestId: 'r1' }
      },
      transport: 'tcp'
    }
    expect(mapLanWireEventReceivedHostEvent(event)).toEqual({
      requestId: 'r1',
      from: 'peer-1',
      target: 'device-self',
      replyRequestId: undefined,
      event: DEVICE_PAIRING_REQUEST_EVENT,
      payload: { requestId: 'r1' },
      timestamp: event.timestamp,
      transport: 'tcp'
    })
  })

  test('maps lan event from root envelope when payload misses from/target', () => {
    const event: HostEvent = {
      id: 7,
      timestamp: Date.now(),
      type: 'transport.lan.event.received',
      from: 'peer-2',
      target: 'device-self',
      event: DEVICE_PAIRING_REQUEST_EVENT,
      payload: {
        requestId: 'r2',
        payload: { requestId: 'r2' }
      },
      transport: 'tcp'
    }
    expect(mapLanWireEventReceivedHostEvent(event)).toEqual({
      requestId: 'r2',
      from: 'peer-2',
      target: 'device-self',
      replyRequestId: undefined,
      event: DEVICE_PAIRING_REQUEST_EVENT,
      payload: { requestId: 'r2' },
      timestamp: event.timestamp,
      transport: 'tcp'
    })
  })

  test('maps closed and heartbeat timeout events', () => {
    const closed: HostEvent = {
      id: 2,
      timestamp: Date.now(),
      type: 'transport.closed',
      deviceId: 'device-a',
      payload: { reason: 'peer-closed' },
      transport: 'tcp'
    }
    const timeout: HostEvent = {
      id: 3,
      timestamp: Date.now(),
      type: 'host.heartbeat.timeout',
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
      deviceId: 'device-a',
      code: DEVICE_CONNECTION_TRANSPORT_ERROR_CODES.transportIoError,
      payload: { message: 'broken pipe' },
      transport: 'tcp'
    }
    const messageReceived: HostEvent = {
      id: 5,
      timestamp: Date.now(),
      type: 'transport.message.received',
      deviceId: 'device-a',
      event: 'custom.chat.text',
      transport: 'tcp'
    }

    expect(mapTransportErrorHostEvent(transportError)).toEqual({
      deviceId: 'device-a',
      code: DEVICE_CONNECTION_TRANSPORT_ERROR_CODES.transportIoError,
      message: 'broken pipe',
      transport: 'tcp'
    })
    expect(mapMessageTypeFromHostEvent(messageReceived)).toBe('custom.chat.text')
  })
})
