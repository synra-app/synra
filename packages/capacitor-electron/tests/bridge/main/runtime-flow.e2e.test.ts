import { describe, expect, test, vi } from 'vite-plus/test'
import { createLoopbackTransportPair } from '../../../../transport-core/src/index.ts'
import { createBridgeHandlers } from '../../../src/bridge/main/handlers'
import { createMainDispatcher } from '../../../src/bridge/main/dispatch'
import { createOpenUrlRuntimeFixturePlugin } from '../../support/open-url-runtime-fixture.plugin'
import { createPluginCatalogService } from '../../../src/host/services/plugin-catalog.service'
import { createPluginRuntimeService } from '../../../src/host/services/plugin-runtime.service'
import { createRuntimeInfoService } from '../../../src/host/services/runtime-info.service'
import { BRIDGE_METHODS, BRIDGE_PROTOCOL_VERSION } from '../../../src/shared/protocol/constants'
import type { MethodResultMap } from '../../../src/shared/protocol/types'
import type { RuntimeExecuteOptions } from '../../../src/shared/protocol/types'

function createRuntimeExecuteMessage(requestId: string) {
  return {
    protocolVersion: '1.0' as const,
    requestId,
    replyRequestId: undefined,
    event: 'action.selected' as const,
    traceId: 'trace-dup',
    sentAt: Date.now(),
    ttlMs: 15_000,
    from: 'mobile-1',
    target: 'pc-1',
    payload: {
      requestId: `execute-${requestId}`,
      sourceDeviceId: 'mobile-1',
      targetDeviceId: 'pc-1',
      replyToRequestId: undefined,
      input: { type: 'url', raw: 'https://github.com/synra/synra' },
      action: {
        actionId: 'test-external-url:open',
        pluginId: 'test-external-url',
        actionType: 'external.open-url',
        label: 'Open in browser',
        requiresConfirm: true,
        payload: { url: 'https://github.com/synra/synra' }
      },
      timeoutMs: 15_000
    }
  }
}

describe('bridge/main runtime e2e flow', () => {
  test('runs catalog -> resolveActions -> execute with runtime lifecycle', async () => {
    const openExternal = vi.fn(async () => ({ success: true as const }))
    const runtime = createPluginRuntimeService()
    runtime.register(createOpenUrlRuntimeFixturePlugin({ openExternal }))
    const catalog = createPluginCatalogService(runtime)
    const handlers = createBridgeHandlers({
      runtimeInfoService: createRuntimeInfoService(),
      externalLinkService: { openExternal },
      fileService: {
        readFile: vi.fn(async () => ({ content: '', encoding: 'utf-8' as BufferEncoding }))
      },
      pluginRuntimeService: runtime,
      pluginCatalogService: catalog,
      deviceDiscoveryService: {
        startDiscovery: vi.fn(async () => ({
          requestId: 'discovery-e2e-1',
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
          deviceId: 'dev-e2e-1',
          state: 'open' as const,
          transport: 'tcp' as const
        })),
        closeTransport: vi.fn(async () => ({
          success: true as const,
          target: 'dev-e2e-1',
          transport: 'tcp' as const
        })),
        sendMessage: vi.fn(async () => ({
          success: true as const,
          target: 'dev-e2e-1',
          transport: 'tcp' as const
        })),
        sendLanEvent: vi.fn(async () => ({
          success: true as const,
          target: 'dev-e2e-1',
          transport: 'tcp' as const
        })),
        getTransportState: vi.fn(async () => ({
          deviceId: 'dev-e2e-1',
          state: 'open' as const,
          transport: 'tcp' as const
        })),
        pullHostEvents: vi.fn(async () => ({ events: [] }))
      },
      connectionService: {
        openTransport: vi.fn(async () => ({
          success: true as const,
          deviceId: 'dev-e2e-1',
          state: 'open' as const,
          transport: 'tcp' as const
        })),
        closeTransport: vi.fn(async () => ({
          success: true as const,
          target: 'dev-e2e-1',
          transport: 'tcp' as const
        })),
        sendMessage: vi.fn(async () => ({
          success: true as const,
          target: 'dev-e2e-1',
          transport: 'tcp' as const
        })),
        sendLanEvent: vi.fn(async () => ({
          success: true as const,
          target: 'dev-e2e-1',
          transport: 'tcp' as const
        })),
        getTransportState: vi.fn(async () => ({
          deviceId: 'dev-e2e-1',
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
    const dispatch = createMainDispatcher(handlers)

    const catalogResponse = await dispatch({
      protocolVersion: BRIDGE_PROTOCOL_VERSION,
      requestId: 'catalog-1',
      method: BRIDGE_METHODS.pluginCatalogGet,
      payload: {}
    })
    expect(catalogResponse.ok).toBe(true)
    if (!catalogResponse.ok) {
      return
    }
    const catalogData = catalogResponse.data as MethodResultMap['plugin.catalog.get']
    expect(catalogData.plugins.length).toBeGreaterThanOrEqual(1)

    const actionsResponse = await dispatch({
      protocolVersion: BRIDGE_PROTOCOL_VERSION,
      requestId: 'resolve-1',
      method: BRIDGE_METHODS.runtimeResolveActions,
      payload: {
        input: { type: 'url', raw: 'https://github.com/synra/synra' }
      }
    })
    expect(actionsResponse.ok).toBe(true)
    if (!actionsResponse.ok) {
      return
    }
    const actionsData = actionsResponse.data as MethodResultMap['runtime.resolveActions']
    expect(actionsData.candidates).toHaveLength(1)
    const selected = actionsData.candidates[0]?.action
    expect(selected).toBeTruthy()

    const executeResponse = await dispatch({
      protocolVersion: BRIDGE_PROTOCOL_VERSION,
      requestId: 'execute-1',
      method: BRIDGE_METHODS.runtimeExecute,
      payload: {
        sessionId: 'session-1',
        input: { type: 'url', raw: 'https://github.com/synra/synra' },
        action: selected
      }
    })
    expect(executeResponse.ok).toBe(true)
    if (!executeResponse.ok) {
      return
    }
    const executeData = executeResponse.data as MethodResultMap['runtime.execute']

    expect(executeData.messages.map((message) => message.event)).toEqual([
      'runtime.received',
      'runtime.started',
      'runtime.finished'
    ])
    expect(executeData.receipt.ok).toBe(true)
    expect(openExternal).toHaveBeenCalledTimes(1)
  })

  test('does not execute duplicated message id over loopback transport', async () => {
    const openExternal = vi.fn(async () => ({ success: true as const }))
    const runtime = createPluginRuntimeService()
    runtime.register(createOpenUrlRuntimeFixturePlugin({ openExternal }))
    const handlers = createBridgeHandlers({
      runtimeInfoService: createRuntimeInfoService(),
      externalLinkService: { openExternal },
      fileService: {
        readFile: vi.fn(async () => ({ content: '', encoding: 'utf-8' as BufferEncoding }))
      },
      pluginRuntimeService: runtime,
      pluginCatalogService: createPluginCatalogService(runtime),
      deviceDiscoveryService: {
        startDiscovery: vi.fn(async () => ({
          requestId: 'discovery-e2e-2',
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
          deviceId: 'dev-e2e-2',
          state: 'open' as const,
          transport: 'tcp' as const
        })),
        closeTransport: vi.fn(async () => ({
          success: true as const,
          target: 'dev-e2e-2',
          transport: 'tcp' as const
        })),
        sendMessage: vi.fn(async () => ({
          success: true as const,
          target: 'dev-e2e-2',
          transport: 'tcp' as const
        })),
        sendLanEvent: vi.fn(async () => ({
          success: true as const,
          target: 'dev-e2e-2',
          transport: 'tcp' as const
        })),
        getTransportState: vi.fn(async () => ({
          deviceId: 'dev-e2e-2',
          state: 'open' as const,
          transport: 'tcp' as const
        })),
        pullHostEvents: vi.fn(async () => ({ events: [] }))
      },
      connectionService: {
        openTransport: vi.fn(async () => ({
          success: true as const,
          deviceId: 'dev-e2e-2',
          state: 'open' as const,
          transport: 'tcp' as const
        })),
        closeTransport: vi.fn(async () => ({
          success: true as const,
          target: 'dev-e2e-2',
          transport: 'tcp' as const
        })),
        sendMessage: vi.fn(async () => ({
          success: true as const,
          target: 'dev-e2e-2',
          transport: 'tcp' as const
        })),
        sendLanEvent: vi.fn(async () => ({
          success: true as const,
          target: 'dev-e2e-2',
          transport: 'tcp' as const
        })),
        getTransportState: vi.fn(async () => ({
          deviceId: 'dev-e2e-2',
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
    const dispatch = createMainDispatcher(handlers)
    const [mobileTransport, pcTransport] = createLoopbackTransportPair()

    pcTransport.onMessage(async (message) => {
      if (message.event !== 'action.selected') {
        return
      }

      await dispatch({
        protocolVersion: BRIDGE_PROTOCOL_VERSION,
        requestId: `dispatch:${message.requestId}`,
        method: BRIDGE_METHODS.runtimeExecute,
        payload: message.payload as RuntimeExecuteOptions
      })
    })

    const duplicatedMessage = createRuntimeExecuteMessage('dup-001')

    await mobileTransport.send(duplicatedMessage)
    await mobileTransport.send(duplicatedMessage)

    expect(openExternal).toHaveBeenCalledTimes(1)
  })
})
