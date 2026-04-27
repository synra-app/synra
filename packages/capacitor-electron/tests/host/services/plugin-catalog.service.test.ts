import { describe, expect, test } from 'vite-plus/test'
import type { SynraActionPlugin } from '@synra/plugin-sdk'
import os from 'node:os'
import path from 'node:path'
import { createPluginCatalogService } from '../../../src/host/services/plugin-catalog.service'
import { createPluginRuntimeService } from '../../../src/host/services/plugin-runtime.service'

function createEmptyInstallStorePath(testName: string): string {
  return path.join(os.tmpdir(), `synra-plugin-catalog-${testName}-${Date.now()}.json`)
}

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
    const catalogService = createPluginCatalogService(runtime, {
      installStorePath: createEmptyInstallStorePath('runtime')
    })

    const catalog = await catalogService.getCatalog()

    expect(catalog.generatedAt).toBeTypeOf('number')
    expect(catalog.plugins).toEqual(
      expect.arrayContaining([
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
    runtime.register({
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
    })
    const catalogService = createPluginCatalogService(runtime, {
      installStorePath: createEmptyInstallStorePath('filters')
    })

    const catalog = await catalogService.getCatalog({ knownPluginIds: ['catalog-fixture'] })

    expect(catalog.plugins.some((plugin) => plugin.pluginId === 'catalog-fixture')).toBe(false)
  })
})
