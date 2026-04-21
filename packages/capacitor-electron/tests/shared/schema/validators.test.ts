import { describe, expect, test } from 'vite-plus/test'
import {
  isBridgeRequest,
  isBridgeResponse,
  isSupportedMethod,
  isSupportedProtocolVersion,
  validateResolveActionsPayload,
  validateRuntimeExecutePayload,
  validateExternalOpenPayload,
  validateDiscoveryOpenSessionPayload,
  validateDiscoverySendMessagePayload,
  validateDiscoveryStartPayload,
  validateReadFilePayload
} from '../../../src/shared/schema/validators'
import { BRIDGE_METHODS, BRIDGE_PROTOCOL_VERSION } from '../../../src/shared/protocol/constants'

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
    expect(isSupportedMethod(BRIDGE_METHODS.discoveryOpenSession)).toBe(true)
    expect(isSupportedMethod(BRIDGE_METHODS.discoverySendMessage)).toBe(true)
    expect(isSupportedMethod(BRIDGE_METHODS.discoveryPullHostEvents)).toBe(true)
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
        sessionId: 'session-1',
        input: { type: 'url', raw: 'https://github.com/synra' },
        action: {
          actionId: 'a1',
          pluginId: 'github-open',
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
      validateDiscoveryOpenSessionPayload({
        deviceId: 'device-1',
        host: '10.0.0.109',
        port: 32100
      })
    ).toBe(true)
    expect(
      validateDiscoverySendMessagePayload({
        sessionId: 'session-1',
        messageType: 'chat',
        payload: 'hello'
      })
    ).toBe(true)
  })
})
