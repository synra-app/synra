import { describe, expect, test } from 'vite-plus/test'
import {
  type BridgeInvoke,
  createElectronBridgePlugin,
  createElectronBridgePluginFromGlobal
} from '../../src/plugin'
import { BRIDGE_ERROR_CODES } from '../../src/shared/errors/codes'
import { BRIDGE_METHODS, BRIDGE_PROTOCOL_VERSION } from '../../src/shared/protocol/constants'
import type { MethodResultMap } from '../../src/shared/protocol/types'

describe('plugin', () => {
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
          handledBy: 'test-plugin',
          durationMs: 1
        }
      } as unknown as MethodResultMap[typeof method]
    }
    const plugin = createElectronBridgePlugin(invoke)
    const result = await plugin.executeRuntimeAction({
      requestId: 'req-exec-1',
      sourceDeviceId: 'local',
      targetDeviceId: 'remote',
      input: { type: 'url', raw: 'https://github.com/synra' },
      action: {
        actionId: 'a1',
        pluginId: 'test-plugin',
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
            pluginId: 'test-plugin',
            version: '0.1.0',
            displayName: 'test-plugin'
          }
        ],
        generatedAt: Date.now()
      } as MethodResultMap[typeof method]
    }
    const plugin = createElectronBridgePlugin(invoke)
    const result = await plugin.getPluginCatalog()
    expect(result.plugins).toHaveLength(1)
  })

  test('registers installed plugins through invoke', async () => {
    const invoke: BridgeInvoke = async (method, payload) => {
      expect(method).toBe(BRIDGE_METHODS.pluginRegisterInstalled)
      expect(payload).toMatchObject({
        plugins: [{ pluginId: 'chat' }]
      })
      return {
        registeredPluginIds: ['chat'],
        failedPlugins: []
      } as unknown as MethodResultMap[typeof method]
    }
    const plugin = createElectronBridgePlugin(invoke)
    const result = await plugin.registerInstalledPlugins({
      plugins: [
        {
          pluginId: 'chat',
          packageName: '@synra-plugin/chat',
          version: '0.1.2',
          title: 'Chat',
          defaultPage: 'home',
          builtin: false,
          installedAt: Date.now(),
          artifactRoot: 'C:/Users/test/.synra/plugins/chat/0.1.2',
          entries: {}
        }
      ]
    })
    expect(result.registeredPluginIds).toContain('chat')
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
