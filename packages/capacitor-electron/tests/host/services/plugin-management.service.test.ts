import os from 'node:os'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'pathe'
import { c as createTar } from 'tar'
import { afterEach, describe, expect, test, vi } from 'vite-plus/test'
import { createPluginManagementService } from '../../../src/host/services/plugin-management.service'

function createTempRootDir(testName: string): string {
  return join(os.tmpdir(), `synra-plugin-management-${testName}-${Date.now()}`)
}

async function createPluginTarball(options: { includeUiEntry: boolean }): Promise<Buffer> {
  const sourceRoot = join(os.tmpdir(), `synra-plugin-artifact-${Date.now()}-${Math.random()}`)
  const distUiRoot = join(sourceRoot, 'dist/ui')
  mkdirSync(distUiRoot, { recursive: true })
  if (options.includeUiEntry) {
    writeFileSync(join(distUiRoot, 'index.mjs'), 'export default class TestPlugin {}', 'utf8')
  }
  writeFileSync(join(distUiRoot, 'pages.json'), JSON.stringify({ pages: [] }), 'utf8')
  const archiveStream = createTar({ gzip: true, cwd: sourceRoot }, ['.'])
  const chunks: Buffer[] = []
  for await (const chunk of archiveStream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  rmSync(sourceRoot, { recursive: true, force: true })
  return Buffer.concat(chunks)
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return Uint8Array.from(buffer).buffer
}

function stubFetchWithMetadata(options: {
  version?: string
  tarballUrl?: string
  tarballBuffer?: Buffer
  shasum?: string
}): void {
  const version = options.version ?? '1.2.3'
  const tarballUrl = options.tarballUrl
  const tarballBuffer = options.tarballBuffer ?? Buffer.from('placeholder')
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL) => {
      const url = String(input)
      if (tarballUrl && url === tarballUrl) {
        return {
          ok: true,
          arrayBuffer: async () => toArrayBuffer(tarballBuffer)
        }
      }
      return {
        ok: true,
        json: async () => ({
          name: '@synra-plugin/test-chat',
          'dist-tags': { latest: version },
          versions: {
            [version]: {
              name: '@synra-plugin/test-chat',
              version,
              dist: {
                tarball: tarballUrl,
                shasum: options.shasum ?? 'abc123'
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
      }
    })
  )
}

describe('host/services/plugin-management.service', () => {
  const createdRootDirs: string[] = []

  function registerRootDir(name: string): string {
    const root = createTempRootDir(name)
    createdRootDirs.push(root)
    return root
  }

  afterEach(() => {
    vi.unstubAllGlobals()
    for (const rootDir of createdRootDirs.splice(0, createdRootDirs.length)) {
      rmSync(rootDir, { recursive: true, force: true })
    }
  })

  test('install/list/uninstall follows dynamic install workflow', async () => {
    const tarballUrl = 'https://registry.example/@synra-plugin/test-chat/-/test-chat-1.2.3.tgz'
    stubFetchWithMetadata({
      tarballUrl,
      tarballBuffer: await createPluginTarball({ includeUiEntry: true })
    })
    const service = createPluginManagementService({
      rootDir: registerRootDir('happy-path')
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
    expect(existsSync(installed.artifactRoot)).toBe(false)
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
      rootDir: registerRootDir('missing-version')
    })
    await expect(
      service.install({
        packageName: '@synra-plugin/test-chat',
        version: '9.9.9'
      })
    ).rejects.toThrow("Version '9.9.9' not found")
  })

  test('fails install when npm metadata has no dist.tarball and does not persist record', async () => {
    stubFetchWithMetadata({ tarballUrl: undefined })
    const rootDir = registerRootDir('missing-tarball')
    const service = createPluginManagementService({ rootDir })

    await expect(
      service.install({
        packageName: '@synra-plugin/test-chat'
      })
    ).rejects.toThrow('missing dist.tarball')

    const listed = await service.listInstalled()
    expect(listed.plugins).toEqual([])
    expect(existsSync(join(rootDir, 'test-chat', '1.2.3'))).toBe(false)
  })

  test('cleans staging output when extraction fails', async () => {
    const tarballUrl = 'https://registry.example/@synra-plugin/test-chat/-/test-chat-1.2.3.tgz'
    stubFetchWithMetadata({
      tarballUrl,
      tarballBuffer: Buffer.from('invalid tarball')
    })
    const rootDir = registerRootDir('extract-fail')
    const service = createPluginManagementService({ rootDir })

    await expect(
      service.install({
        packageName: '@synra-plugin/test-chat'
      })
    ).rejects.toThrow()

    const listed = await service.listInstalled()
    expect(listed.plugins).toEqual([])
    expect(existsSync(join(rootDir, 'test-chat', '1.2.3'))).toBe(false)
  })

  test('listInstalled auto-prunes broken artifact records', async () => {
    const tarballUrl = 'https://registry.example/@synra-plugin/test-chat/-/test-chat-1.2.3.tgz'
    stubFetchWithMetadata({
      tarballUrl,
      tarballBuffer: await createPluginTarball({ includeUiEntry: true })
    })
    const service = createPluginManagementService({
      rootDir: registerRootDir('auto-prune')
    })

    const installed = await service.install({
      packageName: '@synra-plugin/test-chat'
    })
    rmSync(join(installed.artifactRoot, 'package', 'dist', 'ui', 'index.mjs'), {
      force: true
    })

    const listed = await service.listInstalled()
    expect(listed.plugins).toEqual([])
    expect(existsSync(installed.artifactRoot)).toBe(false)
  })
})
