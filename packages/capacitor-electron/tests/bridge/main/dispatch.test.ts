import { describe, expect, test, vi } from 'vite-plus/test'
import { createBridgeHandlers } from '../../../src/bridge/main/handlers'
import { createMainDispatcher } from '../../../src/bridge/main/dispatch'
import { BRIDGE_ERROR_CODES } from '../../../src/shared/errors/codes'
import { BRIDGE_METHODS, BRIDGE_PROTOCOL_VERSION } from '../../../src/shared/protocol/constants'
import type { MethodResultMap, RuntimeInfo } from '../../../src/shared/protocol/types'

function createRuntimeInfo(): RuntimeInfo {
  return {
    protocolVersion: BRIDGE_PROTOCOL_VERSION,
    supportedProtocolVersions: [BRIDGE_PROTOCOL_VERSION],
    capacitorVersion: '8.0.0',
    electronVersion: '34.0.0',
    nodeVersion: process.versions.node,
    platform: process.platform,
    capabilities: ['runtime.getInfo']
  }
}

function createHandlers() {
  return createBridgeHandlers({
    runtimeInfoService: { getRuntimeInfo: vi.fn(async () => createRuntimeInfo()) },
    externalLinkService: { openExternal: vi.fn(async () => ({ success: true as const })) },
    fileService: {
      readFile: vi.fn(async () => ({ content: 'ok', encoding: 'utf-8' as BufferEncoding }))
    },
    pluginRuntimeService: {
      register: vi.fn(),
      unregister: vi.fn(),
      listPlugins: vi.fn(() => []),
      resolveActions: vi.fn(async () => ({ candidates: [] })),
      executeSelected: vi.fn(async () => ({
        messages: [],
        receipt: {
          ok: true as const,
          actionId: 'a1',
          handledBy: 'test-plugin',
          durationMs: 1
        }
      }))
    },
    pluginCatalogService: {
      getCatalog: vi.fn(async () => ({ plugins: [], generatedAt: Date.now() }))
    },
    deviceDiscoveryService: {
      startDiscovery: vi.fn(async () => ({
        requestId: 'discovery-1',
        state: 'scanning' as const,
        devices: []
      })),
      stopDiscovery: vi.fn(async () => ({ success: true as const })),
      listDevices: vi.fn(async () => ({
        state: 'idle' as const,
        devices: []
      })),
      openTransport: vi.fn(async () => ({
        success: true as const,
        deviceId: 'dev-1',
        state: 'open' as const,
        transport: 'tcp' as const
      })),
      closeTransport: vi.fn(async () => ({
        success: true as const,
        targetDeviceId: 'dev-1',
        transport: 'tcp' as const
      })),
      sendMessage: vi.fn(async () => ({
        success: true as const,
        messageId: 'msg-1',
        targetDeviceId: 'dev-1',
        transport: 'tcp' as const
      })),
      sendLanEvent: vi.fn(async () => ({
        success: true as const,
        targetDeviceId: 'dev-1',
        transport: 'tcp' as const
      })),
      getTransportState: vi.fn(async () => ({
        deviceId: 'dev-1',
        state: 'open' as const,
        transport: 'tcp' as const
      })),
      pullHostEvents: vi.fn(async () => ({ events: [] }))
    },
    connectionService: {
      openTransport: vi.fn(async () => ({
        success: true as const,
        deviceId: 'dev-1',
        state: 'open' as const,
        transport: 'tcp' as const
      })),
      closeTransport: vi.fn(async () => ({
        success: true as const,
        targetDeviceId: 'dev-1',
        transport: 'tcp' as const
      })),
      sendMessage: vi.fn(async () => ({
        success: true as const,
        messageId: 'msg-1',
        targetDeviceId: 'dev-1',
        transport: 'tcp' as const
      })),
      sendLanEvent: vi.fn(async () => ({
        success: true as const,
        targetDeviceId: 'dev-1',
        transport: 'tcp' as const
      })),
      getTransportState: vi.fn(async () => ({
        deviceId: 'dev-1',
        state: 'open' as const,
        transport: 'tcp' as const
      })),
      pullHostEvents: vi.fn(async () => ({ events: [] }))
    },
    preferencesService: {
      get: vi.fn(() => null),
      set: vi.fn(),
      remove: vi.fn(),
      ensureDeviceInstanceUuid: vi.fn(() => '00000000-0000-4000-8000-000000000001')
    }
  })
}

describe('bridge/main/dispatch', () => {
  test('returns runtime info for valid runtime.getInfo request', async () => {
    const dispatch = createMainDispatcher(createHandlers())

    const response = await dispatch({
      protocolVersion: BRIDGE_PROTOCOL_VERSION,
      requestId: 'req-1',
      method: BRIDGE_METHODS.runtimeGetInfo,
      payload: {}
    })

    expect(response.ok).toBe(true)
    if (response.ok) {
      expect((response.data as RuntimeInfo).protocolVersion).toBe(BRIDGE_PROTOCOL_VERSION)
    }
  })

  test('rejects unsupported method with stable error code', async () => {
    const dispatch = createMainDispatcher(createHandlers())
    const response = await dispatch({
      protocolVersion: BRIDGE_PROTOCOL_VERSION,
      requestId: 'req-2',
      method: 'unknown.method',
      payload: {}
    })

    expect(response.ok).toBe(false)
    if (!response.ok) {
      expect(response.error.code).toBe(BRIDGE_ERROR_CODES.unsupportedOperation)
    }
  })

  test('rejects invalid request shape', async () => {
    const dispatch = createMainDispatcher(createHandlers())
    const response = await dispatch(null)

    expect(response.ok).toBe(false)
    if (!response.ok) {
      expect(response.error.code).toBe(BRIDGE_ERROR_CODES.invalidParams)
    }
  })

  test('returns timeout when handler exceeds timeout budget', async () => {
    const slowHandlers = createBridgeHandlers({
      runtimeInfoService: {
        getRuntimeInfo: vi.fn(
          async () =>
            new Promise<RuntimeInfo>((resolve) => {
              setTimeout(() => resolve(createRuntimeInfo()), 30)
            })
        )
      },
      externalLinkService: { openExternal: vi.fn(async () => ({ success: true as const })) },
      fileService: {
        readFile: vi.fn(async () => ({ content: '', encoding: 'utf-8' as BufferEncoding }))
      },
      pluginRuntimeService: {
        register: vi.fn(),
        unregister: vi.fn(),
        listPlugins: vi.fn(() => []),
        resolveActions: vi.fn(async () => ({ candidates: [] })),
        executeSelected: vi.fn(async () => ({
          messages: [],
          receipt: {
            ok: true as const,
            actionId: 'a1',
            handledBy: 'test-plugin',
            durationMs: 1
          }
        }))
      },
      pluginCatalogService: {
        getCatalog: vi.fn(async () => ({ plugins: [], generatedAt: Date.now() }))
      },
      deviceDiscoveryService: {
        startDiscovery: vi.fn(async () => ({
          requestId: 'discovery-2',
          state: 'scanning' as const,
          devices: []
        })),
        stopDiscovery: vi.fn(async () => ({ success: true as const })),
        listDevices: vi.fn(async () => ({
          state: 'idle' as const,
          devices: []
        })),
        openTransport: vi.fn(async () => ({
          success: true as const,
          deviceId: 'dev-1',
          state: 'open' as const,
          transport: 'tcp' as const
        })),
        closeTransport: vi.fn(async () => ({
          success: true as const,
          targetDeviceId: 'dev-1',
          transport: 'tcp' as const
        })),
        sendMessage: vi.fn(async () => ({
          success: true as const,
          messageId: 'msg-1',
          targetDeviceId: 'dev-1',
          transport: 'tcp' as const
        })),
        sendLanEvent: vi.fn(async () => ({
          success: true as const,
          targetDeviceId: 'dev-1',
          transport: 'tcp' as const
        })),
        getTransportState: vi.fn(async () => ({
          deviceId: 'dev-1',
          state: 'open' as const,
          transport: 'tcp' as const
        })),
        pullHostEvents: vi.fn(async () => ({ events: [] }))
      },
      connectionService: {
        openTransport: vi.fn(async () => ({
          success: true as const,
          deviceId: 'dev-1',
          state: 'open' as const,
          transport: 'tcp' as const
        })),
        closeTransport: vi.fn(async () => ({
          success: true as const,
          targetDeviceId: 'dev-1',
          transport: 'tcp' as const
        })),
        sendMessage: vi.fn(async () => ({
          success: true as const,
          messageId: 'msg-1',
          targetDeviceId: 'dev-1',
          transport: 'tcp' as const
        })),
        sendLanEvent: vi.fn(async () => ({
          success: true as const,
          targetDeviceId: 'dev-1',
          transport: 'tcp' as const
        })),
        getTransportState: vi.fn(async () => ({
          deviceId: 'dev-1',
          state: 'open' as const,
          transport: 'tcp' as const
        })),
        pullHostEvents: vi.fn(async () => ({ events: [] }))
      },
      preferencesService: {
        get: vi.fn(() => null),
        set: vi.fn(),
        remove: vi.fn(),
        ensureDeviceInstanceUuid: vi.fn(() => '00000000-0000-4000-8000-000000000001')
      }
    })
    const dispatch = createMainDispatcher(slowHandlers, { defaultTimeoutMs: 1 })
    const response = await dispatch({
      protocolVersion: BRIDGE_PROTOCOL_VERSION,
      requestId: 'req-3',
      method: BRIDGE_METHODS.runtimeGetInfo,
      payload: {}
    })

    expect(response.ok).toBe(false)
    if (!response.ok) {
      expect(response.error.code).toBe(BRIDGE_ERROR_CODES.timeout)
    }
  })

  test('dispatches discovery.start with payload', async () => {
    const handlers = createHandlers()
    const dispatch = createMainDispatcher(handlers)
    const response = await dispatch({
      protocolVersion: BRIDGE_PROTOCOL_VERSION,
      requestId: 'req-4',
      method: BRIDGE_METHODS.discoveryStart,
      payload: {
        includeLoopback: true,
        manualTargets: ['192.168.1.120']
      }
    })

    expect(response.ok).toBe(true)
    if (!response.ok) {
      return
    }

    const startData = response.data as MethodResultMap['discovery.start']
    expect(startData.state).toBe('scanning')
    expect(startData.requestId).toBe('discovery-1')
  })
})
