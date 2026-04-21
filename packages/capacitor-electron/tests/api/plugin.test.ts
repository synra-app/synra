import { describe, expect, test } from 'vite-plus/test'
import {
  type BridgeInvoke,
  createElectronBridgePlugin,
  createElectronBridgePluginFromGlobal
} from '../../src/api/plugin'
import { BRIDGE_ERROR_CODES } from '../../src/shared/errors/codes'
import { BRIDGE_METHODS, BRIDGE_PROTOCOL_VERSION } from '../../src/shared/protocol/constants'
import type { MethodResultMap } from '../../src/shared/protocol/types'

describe('api/plugin', () => {
  test('calls runtime.getInfo through invoke', async () => {
    const invoke: BridgeInvoke = async (method) => {
      expect(method).toBe(BRIDGE_METHODS.runtimeGetInfo)
      return {
        protocolVersion: BRIDGE_PROTOCOL_VERSION,
        supportedProtocolVersions: [BRIDGE_PROTOCOL_VERSION],
        capacitorVersion: '8.0.0',
        electronVersion: '34.0.0',
        nodeVersion: process.versions.node,
        platform: process.platform,
        capabilities: ['runtime.getInfo']
      } as MethodResultMap[typeof method]
    }
    const plugin = createElectronBridgePlugin(invoke)

    const runtimeInfo = await plugin.getRuntimeInfo()
    expect(runtimeInfo.protocolVersion).toBe(BRIDGE_PROTOCOL_VERSION)
  })

  test('validates openExternal input', async () => {
    const invoke: BridgeInvoke = async () => {
      throw new Error('invoke should not be called for invalid params')
    }
    const plugin = createElectronBridgePlugin(invoke)
    await expect(plugin.openExternal(null as never)).rejects.toMatchObject({
      code: BRIDGE_ERROR_CODES.invalidParams
    })
  })

  test('resolves runtime actions through invoke', async () => {
    const invoke: BridgeInvoke = async (method) => {
      expect(method).toBe(BRIDGE_METHODS.runtimeResolveActions)
      return {
        candidates: []
      } as unknown as MethodResultMap[typeof method]
    }
    const plugin = createElectronBridgePlugin(invoke)
    const result = await plugin.resolveRuntimeActions({
      input: { type: 'url', raw: 'https://github.com/synra' }
    })
    expect(result.candidates).toEqual([])
  })

  test('executes runtime action through invoke', async () => {
    const invoke: BridgeInvoke = async (method) => {
      expect(method).toBe(BRIDGE_METHODS.runtimeExecute)
      return {
        messages: [],
        receipt: {
          ok: true,
          actionId: 'a1',
          handledBy: 'github-open',
          durationMs: 1
        }
      } as unknown as MethodResultMap[typeof method]
    }
    const plugin = createElectronBridgePlugin(invoke)
    const result = await plugin.executeRuntimeAction({
      sessionId: 'session-1',
      input: { type: 'url', raw: 'https://github.com/synra' },
      action: {
        actionId: 'a1',
        pluginId: 'github-open',
        actionType: 'external.open-url',
        label: 'Open in browser',
        requiresConfirm: true,
        payload: { url: 'https://github.com/synra' }
      }
    })
    expect(result.receipt.ok).toBe(true)
  })

  test('gets plugin catalog through invoke', async () => {
    const invoke: BridgeInvoke = async (method) => {
      expect(method).toBe(BRIDGE_METHODS.pluginCatalogGet)
      return {
        plugins: [
          {
            pluginId: 'github-open',
            version: '0.1.0',
            displayName: 'github-open'
          }
        ],
        generatedAt: Date.now()
      } as MethodResultMap[typeof method]
    }
    const plugin = createElectronBridgePlugin(invoke)
    const result = await plugin.getPluginCatalog()
    expect(result.plugins).toHaveLength(1)
  })

  test('starts and lists device discovery through invoke', async () => {
    const invoke: BridgeInvoke = async (method, payload) => {
      if (method === BRIDGE_METHODS.discoveryStart) {
        expect(payload).toMatchObject({
          includeLoopback: true,
          manualTargets: ['192.168.1.200']
        })
        return {
          requestId: 'discovery-1',
          state: 'scanning',
          devices: []
        } as unknown as MethodResultMap[typeof method]
      }

      expect(method).toBe(BRIDGE_METHODS.discoveryList)
      return {
        state: 'scanning',
        devices: []
      } as unknown as MethodResultMap[typeof method]
    }

    const plugin = createElectronBridgePlugin(invoke)
    const start = await plugin.startDeviceDiscovery({
      includeLoopback: true,
      manualTargets: ['192.168.1.200']
    })
    const list = await plugin.listDiscoveredDevices()

    expect(start.state).toBe('scanning')
    expect(list.devices).toHaveLength(0)
  })

  test('throws when preload bridge is missing on global', async () => {
    expect(() => createElectronBridgePluginFromGlobal({})).toThrow(
      'Preload bridge is not available'
    )
  })
})
