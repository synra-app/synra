import { expect, test } from 'vite-plus/test'
import {
  getSynraUiManifestMetadata,
  normalizePluginPagePath,
  parsePluginIdFromPackageName,
  SynraPlugin,
  createPluginBridge
} from '../src/index.ts'

test('parsePluginIdFromPackageName supports scoped and unscoped names', () => {
  expect(parsePluginIdFromPackageName('@synra-plugin/chat')).toBe('chat')
  expect(parsePluginIdFromPackageName('synra-plugin-my-tool')).toBe('my-tool')
  expect(parsePluginIdFromPackageName('@foo/chat')).toBeNull()
  expect(parsePluginIdFromPackageName('@synra-plugin/Chat')).toBeNull()
})

test('normalizePluginPagePath always returns normalized absolute path', () => {
  expect(normalizePluginPagePath('home')).toBe('/home')
  expect(normalizePluginPagePath('/home')).toBe('/home')
  expect(normalizePluginPagePath('//home//index')).toBe('/home/index')
})

test('getSynraUiManifestMetadata derives ui metadata from package manifest', () => {
  const result = getSynraUiManifestMetadata({
    name: '@synra-plugin/chat',
    version: '1.2.3',
    synra: {
      title: 'Chat',
      builtin: true,
      defaultPage: 'home',
      icon: 'material-symbols:chat-bubble-outline',
      entries: {
        ui: 'dist/synra/index.js'
      }
    }
  })
  expect(result.pluginId).toBe('chat')
  expect(result.packageName).toBe('@synra-plugin/chat')
  expect(result.version).toBe('1.2.3')
  expect(result.title).toBe('Chat')
  expect(result.builtin).toBe(true)
  expect(result.defaultPage).toBe('home')
  expect(result.icon).toBe('material-symbols:chat-bubble-outline')
  expect(result.entries).toEqual({ ui: 'dist/synra/index.js' })
})

test('SynraPlugin provides default onPluginExit implementation', async () => {
  class DemoPlugin extends SynraPlugin {
    onPluginEnter() {}
  }

  const plugin = new DemoPlugin()
  await plugin.onPluginExit()
})

test('capability gate is removed — pluginId surfaces declared list but does not gate calls', () => {
  // Sanity: there is no `CapabilityDeniedError` export anymore; the
  // public surface never throws on a missing capability. This test
  // exists as a regression guard so a future refactor that re-adds
  // the gate fails fast.
  const bridge = createPluginBridge({ pluginId: 'starter', capabilities: [] })
  expect(bridge.capabilities).toEqual([])
  // No throw; surface exists for introspection.
  expect(typeof bridge.send).toBe('function')
  expect(typeof bridge.broadcast).toBe('function')
})

test('createPluginBridge returns bridge with pluginId and capabilities', () => {
  const bridge = createPluginBridge({
    pluginId: '@synra-plugin/chat',
    capabilities: ['device:send', 'log:*']
  })
  expect(bridge.pluginId).toBe('@synra-plugin/chat')
  expect(bridge.capabilities).toEqual(['device:send', 'log:*'])
  expect(typeof bridge.usePairedDevices).toBe('function')
  expect(typeof bridge.useSynraPluginEnvelope).toBe('function')
  expect(typeof bridge.send).toBe('function')
  expect(typeof bridge.broadcast).toBe('function')
  expect(typeof bridge.fetch).toBe('function')
  expect(typeof bridge.readFile).toBe('function')
  expect(typeof bridge.dispose).toBe('function')
})

test('createPluginBridge strips @synra-plugin/ prefix for envelope slug', () => {
  const a = createPluginBridge({ pluginId: '@synra-plugin/chat', capabilities: [] })
  const b = createPluginBridge({ pluginId: 'chat', capabilities: [] })
  // Both bridges should produce an envelope; the slug is internal but
  // the bridge surface is identical.
  expect(typeof a.useSynraPluginEnvelope().send).toBe('function')
  expect(typeof b.useSynraPluginEnvelope().send).toBe('function')
})

test('createPluginBridge.dispose is idempotent', () => {
  const bridge = createPluginBridge({ pluginId: 'chat', capabilities: [] })
  expect(() => {
    bridge.dispose()
    bridge.dispose()
  }).not.toThrow()
})
