import { describe, expect, test } from 'vite-plus/test'
import type { SynraActionPlugin } from '@synra/plugin-sdk'
import { createPluginCatalogService } from '../../../src/host/services/plugin-catalog.service'
import { createPluginRuntimeService } from '../../../src/host/services/plugin-runtime.service'

describe('host/services/plugin-catalog.service', () => {
  test('returns plugin entries from runtime registry', async () => {
    const runtime = createPluginRuntimeService()
    const plugin: SynraActionPlugin & {
      meta: {
        packageName: string
        displayName: string
        defaultPage: string
        builtin: boolean
      }
    } = {
      id: 'catalog-fixture',
      version: '0.1.0',
      meta: {
        packageName: 'synra-plugin-catalog-fixture',
        displayName: 'Catalog Fixture',
        defaultPage: 'home',
        builtin: true
      },
      async supports() {
        return { matched: true, score: 100 }
      },
      async buildActions() {
        return []
      },
      async execute() {
        return {
          ok: true as const,
          actionId: 'a1',
          handledBy: 'catalog-fixture',
          durationMs: 1
        }
      }
    }
    runtime.register(plugin)
    const catalogService = createPluginCatalogService(runtime)

    const catalog = await catalogService.getCatalog()

    expect(catalog.generatedAt).toBeTypeOf('number')
    expect(catalog.plugins).toEqual(
      expect.arrayContaining([
        {
          pluginId: 'chat',
          version: '0.1.0',
          displayName: 'Chat',
          status: 'installed',
          builtin: true,
          defaultPage: 'home',
          icon: 'material-symbols:chat-bubble-outline',
          packageName: '@synra-plugin/chat'
        },
        {
          pluginId: 'catalog-fixture',
          version: '0.1.0',
          displayName: 'Catalog Fixture',
          status: 'installed',
          builtin: true,
          defaultPage: 'home',
          icon: undefined,
          packageName: 'synra-plugin-catalog-fixture'
        }
      ])
    )
  })

  test('filters out known plugin ids', async () => {
    const runtime = createPluginRuntimeService()
    const catalogService = createPluginCatalogService(runtime)

    const catalog = await catalogService.getCatalog({ knownPluginIds: ['chat'] })

    expect(catalog.plugins.some((plugin) => plugin.pluginId === 'chat')).toBe(false)
  })
})
