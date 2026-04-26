import { describe, expect, test } from 'vite-plus/test'
import {
  isBridgeRequest,
  isBridgeResponse,
  isSupportedMethod,
  isSupportedProtocolVersion,
  validateDiscoverySendLanEventPayload,
  validateResolveActionsPayload,
  validateRuntimeExecutePayload,
  validateExternalOpenPayload,
  validateDiscoverySendMessagePayload,
  validateDiscoveryStartPayload,
  validateReadFilePayload
} from '../../../src/shared/schema/validators'
import { BRIDGE_METHODS, BRIDGE_PROTOCOL_VERSION } from '../../../src/shared/protocol/constants'
import {
  DEVICE_PAIRING_REQUEST_EVENT,
  DEVICE_TCP_ACK_EVENT,
  DEVICE_TCP_CONNECT_EVENT
} from '@synra/protocol'

const UUID_A = '11111111-1111-4111-8111-111111111111'
const UUID_B = '22222222-2222-4222-8222-222222222222'

describe('shared/schema/validators', () => {
  test('validates bridge request and response shapes', () => {
    expect(
      isBridgeRequest({
        protocolVersion: BRIDGE_PROTOCOL_VERSION,
        requestId: 'req-1',
        method: BRIDGE_METHODS.runtimeGetInfo,
        payload: {}
      })
    ).toBe(true)

    expect(
      isBridgeResponse({
        ok: true,
        requestId: 'req-1',
        data: {}
      })
    ).toBe(true)
  })

  test('checks supported protocol and method', () => {
    expect(isSupportedProtocolVersion(BRIDGE_PROTOCOL_VERSION)).toBe(true)
    expect(isSupportedProtocolVersion('9.9')).toBe(false)
    expect(isSupportedMethod(BRIDGE_METHODS.fileRead)).toBe(true)
    expect(isSupportedMethod(BRIDGE_METHODS.discoveryStart)).toBe(true)
    expect(isSupportedMethod(BRIDGE_METHODS.connectionOpenTransport)).toBe(true)
    expect(isSupportedMethod(BRIDGE_METHODS.connectionSendMessage)).toBe(true)
    expect(isSupportedMethod(BRIDGE_METHODS.connectionSendLanEvent)).toBe(true)
    expect(isSupportedMethod(BRIDGE_METHODS.preferencesGet)).toBe(true)
    expect(isSupportedMethod(BRIDGE_METHODS.preferencesSet)).toBe(true)
    expect(isSupportedMethod(BRIDGE_METHODS.preferencesRemove)).toBe(true)
    expect(isSupportedMethod(BRIDGE_METHODS.runtimeResolveActions)).toBe(true)
    expect(isSupportedMethod(BRIDGE_METHODS.runtimeExecute)).toBe(true)
    expect(isSupportedMethod('unknown.method')).toBe(false)
  })

  test('validates external.open and file.read payloads', () => {
    expect(validateExternalOpenPayload({ url: 'https://synra.dev' })).toBe(true)
    expect(validateExternalOpenPayload({ url: '' })).toBe(false)
    expect(validateReadFilePayload({ path: 'a.txt' })).toBe(true)
    expect(validateReadFilePayload({})).toBe(false)
  })

  test('validates runtime payloads', () => {
    expect(
      validateResolveActionsPayload({ input: { type: 'url', raw: 'https://github.com/synra' } })
    ).toBe(true)
    expect(validateResolveActionsPayload({ input: { type: 'url' } })).toBe(false)
    expect(
      validateRuntimeExecutePayload({
        requestId: 'req-1',
        sourceDeviceId: 'device-a',
        targetDeviceId: 'device-b',
        input: { type: 'url', raw: 'https://github.com/synra' },
        action: {
          actionId: 'a1',
          pluginId: 'test-plugin',
          actionType: 'external.open-url',
          label: 'Open in browser',
          requiresConfirm: true
        }
      })
    ).toBe(true)
  })

  test('validates discovery payloads', () => {
    expect(
      validateDiscoveryStartPayload({
        includeLoopback: true,
        manualTargets: ['192.168.1.100'],
        enableProbeFallback: true,
        discoveryMode: 'hybrid',
        mdnsServiceType: '_synra._tcp.local',
        subnetCidrs: ['192.168.1.0/24'],
        maxProbeHosts: 64,
        concurrency: 16,
        discoveryTimeoutMs: 2000,
        reset: false
      })
    ).toBe(true)
    expect(validateDiscoveryStartPayload({ manualTargets: [1] })).toBe(false)
    expect(
      validateDiscoverySendMessagePayload({
        requestId: 'req-1',
        event: 'chat.message',
        from: UUID_A,
        target: UUID_B,
        payload: 'hello'
      })
    ).toBe(true)
    expect(
      validateDiscoverySendLanEventPayload({
        requestId: 'req-lan-1',
        event: DEVICE_PAIRING_REQUEST_EVENT,
        from: UUID_A,
        target: UUID_B,
        payload: { requestId: 'req-lan-1' }
      })
    ).toBe(true)
    expect(
      validateDiscoverySendLanEventPayload({
        requestId: 'req-lan-2',
        event: 'custom.chat.message',
        from: UUID_A,
        target: UUID_B,
        payload: {}
      })
    ).toBe(false)
    expect(
      validateDiscoverySendMessagePayload({
        requestId: 'req-2',
        event: DEVICE_TCP_CONNECT_EVENT,
        from: UUID_A,
        target: UUID_B,
        payload: {}
      })
    ).toBe(false)
    expect(
      validateDiscoverySendMessagePayload({
        requestId: 'req-3',
        event: DEVICE_TCP_ACK_EVENT,
        from: UUID_A,
        target: UUID_B,
        payload: {}
      })
    ).toBe(false)
    expect(
      validateDiscoverySendMessagePayload({
        requestId: 'req-4',
        event: 'chat.message',
        from: 'local-device',
        target: UUID_B,
        payload: {}
      })
    ).toBe(false)
  })
})
