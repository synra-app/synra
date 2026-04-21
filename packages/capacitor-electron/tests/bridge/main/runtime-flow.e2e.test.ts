import { describe, expect, test, vi } from 'vite-plus/test'
import { createLoopbackTransportPair } from '../../../../transport-core/src/index.ts'
import { createBridgeHandlers } from '../../../src/bridge/main/handlers'
import { createMainDispatcher } from '../../../src/bridge/main/dispatch'
import { createGitHubOpenPlugin } from '../../../src/host/plugins/github-open.plugin'
import { createPluginCatalogService } from '../../../src/host/services/plugin-catalog.service'
import { createPluginRuntimeService } from '../../../src/host/services/plugin-runtime.service'
import { createRuntimeInfoService } from '../../../src/host/services/runtime-info.service'
import { BRIDGE_METHODS, BRIDGE_PROTOCOL_VERSION } from '../../../src/shared/protocol/constants'
import type { MethodResultMap } from '../../../src/shared/protocol/types'

function createLegacyMessage(messageId: string) {
  return {
    protocolVersion: '1.0' as const,
    messageId,
    sessionId: 'session-dup',
    traceId: 'trace-dup',
    type: 'action.selected' as const,
    sentAt: Date.now(),
    ttlMs: 15_000,
    fromDeviceId: 'mobile-1',
    toDeviceId: 'pc-1',
    payload: {
      sessionId: 'session-dup',
      input: { type: 'url', raw: 'https://github.com/synra/synra' },
      action: {
        actionId: 'github-open:open',
        pluginId: 'github-open',
        actionType: 'external.open-url',
        label: 'Open in browser',
        requiresConfirm: true,
        payload: { url: 'https://github.com/synra/synra' }
      }
    }
  }
}

describe('bridge/main runtime e2e flow', () => {
  test('runs catalog -> resolveActions -> execute with runtime lifecycle', async () => {
    const openExternal = vi.fn(async () => ({ success: true as const }))
    const runtime = createPluginRuntimeService()
    runtime.register(createGitHubOpenPlugin({ openExternal }))
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
        openSession: vi.fn(async () => ({
          success: true as const,
          sessionId: 'session-e2e-1',
          state: 'open' as const
        })),
        closeSession: vi.fn(async () => ({
          success: true as const,
          sessionId: 'session-e2e-1'
        })),
        sendMessage: vi.fn(async () => ({
          success: true as const,
          messageId: 'msg-e2e-1',
          sessionId: 'session-e2e-1'
        })),
        getSessionState: vi.fn(async () => ({
          sessionId: 'session-e2e-1',
          state: 'open' as const
        })),
        pullHostEvents: vi.fn(async () => ({ events: [] }))
      },
      connectionService: {
        openSession: vi.fn(async () => ({
          success: true as const,
          sessionId: 'session-e2e-1',
          state: 'open' as const,
          transport: 'tcp' as const
        })),
        closeSession: vi.fn(async () => ({
          success: true as const,
          sessionId: 'session-e2e-1',
          transport: 'tcp' as const
        })),
        sendMessage: vi.fn(async () => ({
          success: true as const,
          messageId: 'msg-e2e-1',
          sessionId: 'session-e2e-1',
          transport: 'tcp' as const
        })),
        getSessionState: vi.fn(async () => ({
          sessionId: 'session-e2e-1',
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

    expect(executeData.messages.map((message) => message.type)).toEqual([
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
    runtime.register(createGitHubOpenPlugin({ openExternal }))
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
        openSession: vi.fn(async () => ({
          success: true as const,
          sessionId: 'session-e2e-2',
          state: 'open' as const
        })),
        closeSession: vi.fn(async () => ({
          success: true as const,
          sessionId: 'session-e2e-2'
        })),
        sendMessage: vi.fn(async () => ({
          success: true as const,
          messageId: 'msg-e2e-2',
          sessionId: 'session-e2e-2'
        })),
        getSessionState: vi.fn(async () => ({
          sessionId: 'session-e2e-2',
          state: 'open' as const
        })),
        pullHostEvents: vi.fn(async () => ({ events: [] }))
      },
      connectionService: {
        openSession: vi.fn(async () => ({
          success: true as const,
          sessionId: 'session-e2e-2',
          state: 'open' as const,
          transport: 'tcp' as const
        })),
        closeSession: vi.fn(async () => ({
          success: true as const,
          sessionId: 'session-e2e-2',
          transport: 'tcp' as const
        })),
        sendMessage: vi.fn(async () => ({
          success: true as const,
          messageId: 'msg-e2e-2',
          sessionId: 'session-e2e-2',
          transport: 'tcp' as const
        })),
        getSessionState: vi.fn(async () => ({
          sessionId: 'session-e2e-2',
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
      if (message.type !== 'action.selected') {
        return
      }

      await dispatch({
        protocolVersion: BRIDGE_PROTOCOL_VERSION,
        requestId: `dispatch:${message.messageId}`,
        method: BRIDGE_METHODS.runtimeExecute,
        payload: message.payload
      })
    })

    const duplicatedMessage = createLegacyMessage('dup-001')

    await mobileTransport.send(duplicatedMessage)
    await mobileTransport.send(duplicatedMessage)

    expect(openExternal).toHaveBeenCalledTimes(1)
  })
})
