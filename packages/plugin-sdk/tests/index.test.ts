import os from 'node:os'
import path from 'node:path'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { expect, test } from 'vite-plus/test'
import {
  getSynraUiManifestMetadata,
  normalizePluginPagePath,
  parsePluginIdFromPackageName,
  SynraPlugin,
  toActionSelectedMessage
} from '../src/index.ts'
import { useConnection } from '../src/hooks/index.ts'
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
        icon: 'material-symbols:chat-bubble-outline'
      }
    })
  ).toEqual({
    pluginId: 'chat',
    packageName: '@synra-plugin/chat',
    version: '1.2.3',
    title: 'Chat',
    builtin: true,
    defaultPage: 'home',
    icon: 'material-symbols:chat-bubble-outline'
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
    const vitePluginNames = ((config.plugins as Array<{ name?: string } | null>) ?? [])
      .map((plugin) => plugin?.name)
      .filter((name): name is string => typeof name === 'string')
    expect(vitePluginNames.some((name) => name.includes('auto-import'))).toBe(false)
    expect(vitePluginNames.some((name) => name.includes('components'))).toBe(false)

    const packPluginNames = (
      (config.pack as { plugins?: Array<{ name?: string } | null> } | undefined)?.plugins ?? []
    )
      .map((plugin) => plugin?.name)
      .filter((name): name is string => typeof name === 'string')
    expect(packPluginNames.some((name) => name.includes('auto-import'))).toBe(false)
    expect(packPluginNames.some((name) => name.includes('components'))).toBe(false)
  } finally {
    process.chdir(previousCwd)
    rmSync(tempRoot, { recursive: true, force: true })
  }
})

test('plugin-sdk hooks should re-export useConnection from @synra/hooks', () => {
  const connection = useConnection()
  expect(typeof connection.sendMessage).toBe('function')
  expect(typeof connection.onMessage).toBe('function')
})
