import os from 'node:os'
import path from 'node:path'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { expect, test } from 'vite-plus/test'
import { ref } from 'vue'
import {
  getSynraUiManifestMetadata,
  normalizePluginPagePath,
  parsePluginIdFromPackageName,
  SynraPlugin,
  toActionSelectedMessage
} from '../src/index.ts'
import {
  configureSynraHooks,
  resetSynraHooks,
  useConnectionState,
  useDevice,
  useDiscovery,
  type SynraHooksAdapter
} from '../src/hooks/index.ts'
import { synraVitePluginConfig } from '../src/vite.ts'

test('toActionSelectedMessage should enforce action.selected type', () => {
  const message = toActionSelectedMessage({
    protocolVersion: '1.0',
    messageId: 'm1',
    sessionId: 's1',
    traceId: 't1',
    sentAt: Date.now(),
    ttlMs: 30_000,
    fromDeviceId: 'mobile-1',
    toDeviceId: 'pc-1',
    payload: {
      actionId: 'a1',
      pluginId: 'github-open',
      actionType: 'openInBrowser',
      label: 'Open in desktop browser',
      requiresConfirm: true,
      payload: { url: 'https://github.com/imba97/smserialport' }
    }
  })

  expect(message.type).toBe('action.selected')
})

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
  expect(
    getSynraUiManifestMetadata({
      name: '@synra-plugin/chat',
      version: '1.2.3',
      synra: {
        title: 'Chat',
        builtin: true,
        defaultPage: 'home',
        icon: 'i-lucide-message-circle'
      }
    })
  ).toEqual({
    pluginId: 'chat',
    packageName: '@synra-plugin/chat',
    version: '1.2.3',
    title: 'Chat',
    builtin: true,
    defaultPage: 'home',
    icon: 'i-lucide-message-circle'
  })
})

test('SynraPlugin provides default onPluginExit implementation', async () => {
  class DemoPlugin extends SynraPlugin {
    onPluginEnter() {}
  }

  const plugin = new DemoPlugin()
  await plugin.onPluginExit()
})

test('synraVitePluginConfig generates default plugin package config', () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'synra-plugin-sdk-'))
  const previousCwd = process.cwd()
  try {
    mkdirSync(path.join(tempRoot, 'pages', 'home'), { recursive: true })
    mkdirSync(path.join(tempRoot, 'pages', 'settings'), { recursive: true })
    writeFileSync(path.join(tempRoot, 'pages', 'home', 'index.vue'), '<template>home</template>')
    writeFileSync(
      path.join(tempRoot, 'pages', 'settings', 'index.vue'),
      '<template>settings</template>'
    )
    process.chdir(tempRoot)

    const config = synraVitePluginConfig()

    expect((config.pack as { entry?: Record<string, string> } | undefined)?.entry).toEqual({
      index: 'src/index.ts',
      __synra_pages__: 'virtual:synra-pages-entry',
      'pages/home/index': 'pages/home/index.vue',
      'pages/settings/index': 'pages/settings/index.vue'
    })
    expect((config.pack as { dts?: boolean } | undefined)?.dts).toBe(false)
    expect((config.pack as { exports?: { devExports: boolean } } | undefined)?.exports).toEqual({
      devExports: true
    })
  } finally {
    process.chdir(previousCwd)
    rmSync(tempRoot, { recursive: true, force: true })
  }
})

function createMockHooksAdapter(): SynraHooksAdapter {
  return {
    scanState: ref('idle'),
    startedAt: ref(undefined),
    scanWindowMs: ref(15_000),
    devices: ref([{ deviceId: 'device-1', paired: true, connectable: true }]),
    loading: ref(false),
    error: ref(null),
    sessionState: ref({ state: 'idle', sessionId: undefined, deviceId: undefined }),
    connectedSessions: ref([
      { sessionId: 'session-open', status: 'open', deviceId: 'device-1', lastActiveAt: Date.now() }
    ]),
    eventLogs: ref([]),
    ensureListeners: async () => {},
    startDiscovery: async () => {},
    stopDiscovery: async () => {},
    refreshDevices: async () => {},
    pairDevice: async () => {},
    probeConnectable: async () => {},
    openSession: async () => {},
    closeSession: async () => {},
    syncSessionState: async () => {},
    sendMessage: async () => {}
  }
}

test('synra hooks should throw when adapter is not configured', () => {
  resetSynraHooks()
  expect(() => useDiscovery()).toThrow(
    'Synra hooks adapter is not configured. Call configureSynraHooks(...) from the host app before using @synra/plugin-sdk/hooks.'
  )
})

test('useDevice should return null for unknown deviceId', () => {
  const adapter = createMockHooksAdapter()
  configureSynraHooks(adapter)
  const { device } = useDevice('unknown-device')
  expect(device.value).toBeNull()
  resetSynraHooks()
})

test('useConnectionState activeSessions should react to status updates', () => {
  const adapter = createMockHooksAdapter()
  configureSynraHooks(adapter)
  const { activeSessions } = useConnectionState()
  expect(activeSessions.value).toHaveLength(1)

  adapter.connectedSessions.value[0].status = 'closed'
  expect(activeSessions.value).toHaveLength(0)
  resetSynraHooks()
})

test('useDiscovery should proxy discovery actions to adapter', async () => {
  const calls: string[] = []
  const adapter = createMockHooksAdapter()
  adapter.startDiscovery = async () => {
    calls.push('startDiscovery')
  }
  adapter.refreshDevices = async () => {
    calls.push('refreshDevices')
  }
  configureSynraHooks(adapter)

  const discovery = useDiscovery()
  await discovery.startDiscovery(['127.0.0.1'])
  await discovery.refreshDevices()
  expect(calls).toEqual(['startDiscovery', 'refreshDevices'])
  resetSynraHooks()
})
