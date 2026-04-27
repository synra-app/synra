import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, test, vi } from 'vite-plus/test'
import { createPluginManagementService } from '../../../src/host/services/plugin-management.service'

function createTempRootDir(testName: string): string {
  return path.join(os.tmpdir(), `synra-plugin-management-${testName}-${Date.now()}`)
}

describe('host/services/plugin-management.service', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('install/list/uninstall follows dynamic install workflow', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          name: '@synra-plugin/test-chat',
          'dist-tags': { latest: '1.2.3' },
          versions: {
            '1.2.3': {
              name: '@synra-plugin/test-chat',
              version: '1.2.3',
              dist: {
                shasum: 'abc123'
              },
              synra: {
                title: 'Test Chat',
                defaultPage: 'home',
                builtin: false,
                icon: 'mdi:chat'
              }
            }
          }
        })
      }))
    )
    const service = createPluginManagementService({
      rootDir: createTempRootDir('happy-path')
    })

    const installed = await service.install({
      packageName: '@synra-plugin/test-chat'
    })
    expect(installed.pluginId).toBe('test-chat')
    expect(installed.version).toBe('1.2.3')
    expect(installed.title).toBe('Test Chat')
    expect(installed.defaultPage).toBe('home')

    const listed = await service.listInstalled()
    expect(listed.plugins).toEqual([installed])

    const removed = await service.uninstall({ pluginId: 'test-chat' })
    expect(removed.success).toBe(true)
  })

  test('rejects invalid plugin package name', async () => {
    const service = createPluginManagementService({
      rootDir: createTempRootDir('invalid-package')
    })
    await expect(
      service.install({
        packageName: '@synra-plugin/Invalid'
      })
    ).rejects.toThrow('Invalid plugin package name')
  })

  test('returns stable error when requested version does not exist', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          name: '@synra-plugin/test-chat',
          'dist-tags': { latest: '1.2.3' },
          versions: {}
        })
      }))
    )
    const service = createPluginManagementService({
      rootDir: createTempRootDir('missing-version')
    })
    await expect(
      service.install({
        packageName: '@synra-plugin/test-chat',
        version: '9.9.9'
      })
    ).rejects.toThrow("Version '9.9.9' not found")
  })
})
