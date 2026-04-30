import { DeviceConnection, type SendMessageOptions } from '@synra/capacitor-device-connection'
import type { ElectronBridgePlugin } from '@synra/capacitor-electron/plugin'
import type {
  InstalledPluginSummary,
  PluginCatalogResult,
  PluginInstallOptions,
  PluginInstallResult,
  PluginListInstalledResult,
  PluginSyncToDeviceOptions,
  PluginSyncToDeviceResult,
  PluginUninstallOptions,
  PluginUninstallResult,
  ReadFileOptions,
  ReadFileResult,
  PluginInstallLocalOptions,
  PluginRegisterInstalledOptions,
  PluginRegisterInstalledResult
} from '@synra/capacitor-electron/protocol'
import {
  getSynraPluginManifestMetadata,
  isValidSynraPluginPackageName,
  resolveSynraPluginUiEntryAbsolutePath,
  type SynraPluginInstallSource,
  type SynraPluginManifest
} from '@synra/plugin-system'
import { extractNpmTgzToMap } from '@synra/plugin-system/browser'
import { fileTransferChunkCount, iteratePluginBundleChunks } from '@synra/protocol'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { dirname, join } from 'pathe'
import { dispatchPluginInstallStoreChanged } from '../../lib/plugin-install-store-events'
import { ensureDeviceInstanceUuid } from '../../lib/device-instance-uuid'

const PLUGIN_ROOT_RELATIVE = 'synra/plugins'
const INSTALL_STORE_RELATIVE = join(PLUGIN_ROOT_RELATIVE, 'installed.json')

type NpmPackageVersionDoc = {
  name: string
  version: string
  dist?: { tarball?: string; shasum?: string }
  synra?: SynraPluginManifest['synra']
}

type NpmPackageMetadataDoc = {
  name: string
  'dist-tags'?: Record<string, string>
  versions?: Record<string, NpmPackageVersionDoc>
}

type InstallStoreDoc = {
  installed: InstalledPluginSummary[]
}

function parseInstallSource(raw: unknown): SynraPluginInstallSource | undefined {
  return raw === 'registry' || raw === 'local' || raw === 'git' ? raw : undefined
}

function sanitizeCapacitorInstalled(doc: InstallStoreDoc): InstallStoreDoc {
  const installed = doc.installed.filter(
    (row) => parseInstallSource(row.installSource) !== undefined
  )
  return {
    installed: installed.map((row) => {
      const installSource = parseInstallSource(row.installSource)!
      return {
        ...row,
        installSource,
        localSourcePath: installSource === 'local' ? row.localSourcePath : undefined
      }
    })
  }
}

function normalizeRegistryUrl(url: string): string {
  const t = url.trim().replace(/\/+$/, '')
  if (!/^https?:\/\//.test(t)) {
    throw new Error(`Invalid registry url '${url}'.`)
  }
  return t
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status} for ${url}`)
  }
  return (await response.json()) as T
}

async function fetchArrayBuffer(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status} for ${url}`)
  }
  return response.arrayBuffer()
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return btoa(binary)
}

function isBenignFilesystemExistsError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  const lower = message.toLowerCase()
  return (
    lower.includes('already exists') ||
    lower.includes('does already exist') ||
    lower.includes('file exists') ||
    lower.includes('eexist')
  )
}

/**
 * When `mkdir({ recursive: true })` fails (e.g. UNIMPLEMENTED on some native stacks), create
 * each path segment with `recursive: false`.
 */
async function mkdirPathSegments(relativeParent: string): Promise<void> {
  const normalized = relativeParent.replace(/^\/+/, '')
  if (!normalized || normalized === '.') {
    return
  }
  const parts = normalized.split('/').filter(Boolean)
  let acc = ''
  for (const part of parts) {
    acc = acc ? join(acc, part) : part
    try {
      await Filesystem.mkdir({
        path: acc,
        directory: Directory.Data,
        recursive: false
      })
    } catch (error) {
      if (isBenignFilesystemExistsError(error)) {
        continue
      }
      throw error
    }
  }
}

/**
 * Prefer explicit mkdir before writeFile: some native Filesystem implementations reject
 * writeFile({ recursive: true }) with UNIMPLEMENTED while mkdir recursive works.
 */
async function ensureDirectoryForRelativePath(relativePath: string): Promise<void> {
  const normalized = relativePath.replace(/^\/+/, '')
  const parent = dirname(normalized)
  if (!parent || parent === '.' || parent === '') {
    return
  }
  try {
    await Filesystem.mkdir({
      path: parent,
      directory: Directory.Data,
      recursive: true
    })
  } catch (error) {
    if (isBenignFilesystemExistsError(error)) {
      return
    }
    try {
      await mkdirPathSegments(parent)
    } catch (segError) {
      if (isBenignFilesystemExistsError(segError)) {
        return
      }
      throw error
    }
  }
}

async function readInstallStore(): Promise<InstallStoreDoc> {
  try {
    const result = await Filesystem.readFile({
      path: INSTALL_STORE_RELATIVE,
      directory: Directory.Data,
      encoding: Encoding.UTF8
    })
    const parsed = JSON.parse(result.data as string) as InstallStoreDoc
    if (!Array.isArray(parsed.installed)) {
      return { installed: [] }
    }
    return sanitizeCapacitorInstalled(parsed)
  } catch {
    return { installed: [] }
  }
}

async function writeInstallStore(doc: InstallStoreDoc): Promise<void> {
  await ensureDirectoryForRelativePath(INSTALL_STORE_RELATIVE)
  await Filesystem.writeFile({
    path: INSTALL_STORE_RELATIVE,
    directory: Directory.Data,
    encoding: Encoding.UTF8,
    data: JSON.stringify(doc, null, 2)
  })
}

function toManifestFromNpmVersionDoc(doc: NpmPackageVersionDoc): SynraPluginManifest {
  return {
    name: doc.name,
    version: doc.version,
    synra: doc.synra
  }
}

async function pathExists(relativePath: string): Promise<boolean> {
  try {
    await Filesystem.stat({
      path: relativePath,
      directory: Directory.Data
    })
    return true
  } catch {
    return false
  }
}

async function writeBinaryFile(relativePath: string, data: Uint8Array): Promise<void> {
  await ensureDirectoryForRelativePath(relativePath)
  await Filesystem.writeFile({
    path: relativePath,
    directory: Directory.Data,
    data: uint8ToBase64(data)
  })
}

async function rmRecursive(relativePath: string): Promise<void> {
  const normalized = relativePath.replace(/^\/+/, '')
  if (!normalized) {
    return
  }

  let stat: { type: 'directory' | 'file' }
  try {
    stat = await Filesystem.stat({
      path: normalized,
      directory: Directory.Data
    })
  } catch {
    return
  }

  if (stat.type === 'directory') {
    const { files } = await Filesystem.readdir({
      path: normalized,
      directory: Directory.Data
    })
    for (const entry of files) {
      await rmRecursive(join(normalized, entry.name))
    }
    await Filesystem.rmdir({
      path: normalized,
      directory: Directory.Data
    })
    return
  }

  try {
    await Filesystem.deleteFile({
      path: normalized,
      directory: Directory.Data
    })
  } catch {
    // ignore missing race
  }
}

function artifactRelativeRoot(pluginId: string, version: string): string {
  return join(PLUGIN_ROOT_RELATIVE, pluginId, version)
}

/**
 * Writes an inbound plugin-bundle tarball to Data storage (SYNRA-COMM::FILE_TRANSFER::RECEIVE path).
 */
export async function persistInboundPluginBundleFromTgzBuffer(
  tgzBuffer: ArrayBuffer
): Promise<InstalledPluginSummary> {
  let phase:
    | 'extract'
    | 'rm-artifact'
    | 'write-files'
    | 'write-tgz'
    | 'verify-ui'
    | 'read-store'
    | 'write-store' = 'extract'
  let pluginIdForLog = 'unknown'

  try {
    const files = extractNpmTgzToMap(tgzBuffer)
    const pkgRaw = files.get('package/package.json')
    if (!pkgRaw) {
      throw new Error('Inbound plugin bundle is missing package/package.json.')
    }
    const manifest = JSON.parse(new TextDecoder().decode(pkgRaw)) as SynraPluginManifest
    const manifestMetadata = getSynraPluginManifestMetadata(manifest)
    pluginIdForLog = manifestMetadata.pluginId
    const artifactRel = artifactRelativeRoot(manifestMetadata.pluginId, manifestMetadata.version)

    phase = 'rm-artifact'
    await rmRecursive(artifactRel)

    phase = 'write-files'
    for (const [relPath, body] of files) {
      const normalized = relPath.replace(/^\/+/, '')
      await writeBinaryFile(join(artifactRel, normalized), body)
    }

    phase = 'write-tgz'
    await writeBinaryFile(join(artifactRel, 'package.tgz'), new Uint8Array(tgzBuffer))

    phase = 'verify-ui'
    const uiAbs = resolveSynraPluginUiEntryAbsolutePath(artifactRel, manifestMetadata.entries)
    if (!(await pathExists(uiAbs))) {
      await rmRecursive(artifactRel)
      throw new Error(`Inbound plugin artifact is incomplete: missing UI entry at '${uiAbs}'.`)
    }

    const record: InstalledPluginSummary = {
      pluginId: manifestMetadata.pluginId,
      packageName: manifestMetadata.packageName,
      version: manifestMetadata.version,
      title: manifestMetadata.title,
      defaultPage: manifestMetadata.defaultPage,
      builtin: manifestMetadata.builtin,
      icon: manifestMetadata.icon,
      installedAt: Date.now(),
      artifactRoot: artifactRel,
      entries: manifestMetadata.entries,
      installSource: 'registry'
    }

    phase = 'read-store'
    const store = await readInstallStore()
    const next = store.installed.filter((item) => item.pluginId !== record.pluginId)
    next.push(record)

    phase = 'write-store'
    await writeInstallStore({ installed: next })
    return record
  } catch (error) {
    const base = error instanceof Error ? error : new Error(String(error))
    const capCode =
      error && typeof error === 'object' && 'code' in error
        ? String((error as { code?: unknown }).code)
        : ''
    const codeSuffix = capCode.length > 0 ? ` code=${capCode}` : ''
    throw new Error(
      `[synra-inbound-persist:${phase}] pluginId=${pluginIdForLog}${codeSuffix} ${base.message}`
    )
  }
}

export function createCapacitorSynraPluginBridge(): ElectronBridgePlugin {
  const notSupported = async (): Promise<never> => {
    throw new Error('This capability is not available in the Capacitor plugin host.')
  }

  return {
    getRuntimeInfo: notSupported,
    openExternal: notSupported,
    resolveRuntimeActions: notSupported,
    executeRuntimeAction: notSupported,
    getPluginCatalog: async (options = {}): Promise<PluginCatalogResult> => {
      const registryUrl = normalizeRegistryUrl(options.registryUrl ?? 'https://registry.npmjs.org')
      const catalogMap = new Map<string, PluginCatalogResult['plugins'][0]>()
      const installed = await readInstallStore()
      for (const plugin of installed.installed) {
        catalogMap.set(plugin.pluginId, {
          pluginId: plugin.pluginId,
          packageName: plugin.packageName,
          version: plugin.version,
          displayName: plugin.title,
          status: 'installed',
          builtin: plugin.builtin,
          defaultPage: plugin.defaultPage,
          icon: plugin.icon,
          entries: plugin.entries
        })
      }
      const query = options.query?.trim()
      if (query) {
        const packageNames: string[] = []
        if (isValidSynraPluginPackageName(query)) {
          packageNames.push(query)
        } else {
          const slug = query.replace(/[^a-z0-9-]/gi, '').toLowerCase()
          if (slug) {
            packageNames.push(`@synra-plugin/${slug}`, `synra-plugin-${slug}`)
          }
        }
        for (const packageName of packageNames) {
          const meta = await fetchJson<NpmPackageMetadataDoc | null>(
            `${registryUrl}/${encodeURIComponent(packageName)}`
          ).catch(() => null)
          if (!meta?.['dist-tags']?.latest) {
            continue
          }
          const resolvedVersion = meta['dist-tags'].latest
          const versionDoc = meta.versions?.[resolvedVersion]
          if (!versionDoc) {
            continue
          }
          let manifestMetadata
          try {
            manifestMetadata = getSynraPluginManifestMetadata(
              toManifestFromNpmVersionDoc(versionDoc)
            )
          } catch {
            continue
          }
          if (catalogMap.has(manifestMetadata.pluginId)) {
            continue
          }
          catalogMap.set(manifestMetadata.pluginId, {
            pluginId: manifestMetadata.pluginId,
            packageName: manifestMetadata.packageName,
            version: manifestMetadata.version,
            displayName: manifestMetadata.title,
            status: 'available',
            builtin: manifestMetadata.builtin,
            defaultPage: manifestMetadata.defaultPage,
            icon: manifestMetadata.icon,
            entries: manifestMetadata.entries
          })
        }
      }
      return {
        plugins: [...catalogMap.values()],
        generatedAt: Date.now()
      }
    },
    installPlugin: async (input: PluginInstallOptions): Promise<PluginInstallResult> => {
      const packageName = input.packageName.trim()
      if (!isValidSynraPluginPackageName(packageName)) {
        throw new Error(
          `Invalid plugin package name '${packageName}'. Expected @synra-plugin/* or synra-plugin-*.`
        )
      }
      const registryUrl = normalizeRegistryUrl(input.registryUrl ?? 'https://registry.npmjs.org')
      const metadata = await fetchJson<NpmPackageMetadataDoc>(
        `${registryUrl}/${encodeURIComponent(packageName)}`
      )
      const resolvedVersion = input.version?.trim() || metadata['dist-tags']?.latest
      if (!resolvedVersion) {
        throw new Error(`Cannot resolve version for '${packageName}'.`)
      }
      const versionDoc = metadata.versions?.[resolvedVersion]
      if (!versionDoc) {
        throw new Error(`Version '${resolvedVersion}' not found for '${packageName}'.`)
      }
      const manifest = toManifestFromNpmVersionDoc(versionDoc)
      const manifestMetadata = getSynraPluginManifestMetadata(manifest)
      const tarballUrl = versionDoc.dist?.tarball
      if (!tarballUrl) {
        throw new Error(`Cannot install '${packageName}@${resolvedVersion}': missing dist.tarball.`)
      }
      const artifactRel = artifactRelativeRoot(manifestMetadata.pluginId, manifestMetadata.version)
      const tgzBuffer = await fetchArrayBuffer(tarballUrl)
      const files = extractNpmTgzToMap(tgzBuffer)
      for (const [relPath, body] of files) {
        const normalized = relPath.replace(/^\/+/, '')
        await writeBinaryFile(join(artifactRel, normalized), body)
      }
      await writeBinaryFile(join(artifactRel, 'package.tgz'), new Uint8Array(tgzBuffer))

      const uiAbs = resolveSynraPluginUiEntryAbsolutePath(artifactRel, manifestMetadata.entries)
      if (!(await pathExists(uiAbs))) {
        await rmRecursive(artifactRel)
        throw new Error(`Installed artifact is incomplete: missing UI entry at '${uiAbs}'.`)
      }

      const record: InstalledPluginSummary = {
        pluginId: manifestMetadata.pluginId,
        packageName: manifestMetadata.packageName,
        version: manifestMetadata.version,
        title: manifestMetadata.title,
        defaultPage: manifestMetadata.defaultPage,
        builtin: manifestMetadata.builtin,
        icon: manifestMetadata.icon,
        installedAt: Date.now(),
        artifactRoot: artifactRel,
        entries: manifestMetadata.entries,
        installSource: 'registry'
      }
      const store = await readInstallStore()
      const next = store.installed.filter((item) => item.pluginId !== record.pluginId)
      next.push(record)
      await writeInstallStore({ installed: next })
      dispatchPluginInstallStoreChanged()
      return record
    },
    installPluginFromLocalPath: async (
      _options: PluginInstallLocalOptions
    ): Promise<PluginInstallResult> => {
      throw new Error('Local plugin installation is not supported on Capacitor.')
    },
    uninstallPlugin: async (options: PluginUninstallOptions): Promise<PluginUninstallResult> => {
      const store = await readInstallStore()
      const found = store.installed.find((p) => p.pluginId === options.pluginId)
      if (!found) {
        return { success: false }
      }
      await rmRecursive(found.artifactRoot)
      const next = store.installed.filter((p) => p.pluginId !== options.pluginId)
      await writeInstallStore({ installed: next })
      dispatchPluginInstallStoreChanged()
      return { success: true }
    },
    listInstalledPlugins: async (): Promise<PluginListInstalledResult> => {
      const store = await readInstallStore()
      const valid: InstalledPluginSummary[] = []
      for (const record of store.installed) {
        const uiAbs = resolveSynraPluginUiEntryAbsolutePath(record.artifactRoot, record.entries)
        if (await pathExists(uiAbs)) {
          valid.push(record)
        } else {
          await rmRecursive(record.artifactRoot).catch(() => undefined)
        }
      }
      if (valid.length !== store.installed.length) {
        await writeInstallStore({ installed: valid })
      }
      return { plugins: valid }
    },
    registerInstalledPlugins: async (
      options: PluginRegisterInstalledOptions
    ): Promise<PluginRegisterInstalledResult> => {
      const registeredPluginIds: string[] = []
      const failedPlugins: PluginRegisterInstalledResult['failedPlugins'] = []
      for (const plugin of options.plugins) {
        try {
          const uiAbs = resolveSynraPluginUiEntryAbsolutePath(plugin.artifactRoot, plugin.entries)
          if (!(await pathExists(uiAbs))) {
            failedPlugins.push({
              pluginId: plugin.pluginId,
              reason: 'artifactBroken',
              message: `Plugin UI entry is missing: '${uiAbs}'.`,
              cleanupRecommended: true
            })
            continue
          }
          registeredPluginIds.push(plugin.pluginId)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          failedPlugins.push({
            pluginId: plugin.pluginId,
            reason: 'registrationFailed',
            message,
            cleanupRecommended: false
          })
        }
      }
      return { registeredPluginIds, failedPlugins }
    },
    syncPluginToDevice: async (
      options: PluginSyncToDeviceOptions,
      _invokeOptions?: { timeoutMs?: number; signal?: AbortSignal }
    ): Promise<PluginSyncToDeviceResult> => {
      const store = await readInstallStore()
      const record = store.installed.find((p) => p.pluginId === options.pluginId)
      if (!record) {
        return { success: false, reason: `Plugin '${options.pluginId}' is not installed.` }
      }
      const tgzRel = join(record.artifactRoot, 'package.tgz')
      if (!(await pathExists(tgzRel))) {
        return { success: false, reason: `Missing package.tgz for '${options.pluginId}'.` }
      }
      const read = await Filesystem.readFile({
        path: tgzRel,
        directory: Directory.Data
      })
      const base64 = read.data as string
      const bin = atob(base64)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i += 1) {
        bytes[i] = bin.charCodeAt(i)
      }
      const chunkSize = 64 * 1024
      const transferId = crypto.randomUUID()
      const localDeviceId = await ensureDeviceInstanceUuid()

      const send = async (payload: SendMessageOptions): Promise<void> => {
        await DeviceConnection.sendMessage(payload)
      }

      await send({
        requestId: crypto.randomUUID(),
        target: options.deviceId,
        from: localDeviceId,
        event: 'file.transfer.request',
        payload: {
          transferId,
          kind: 'plugin-bundle',
          pluginId: record.pluginId,
          version: record.version,
          byteLength: bytes.length
        }
      })

      for (const chunkPayload of iteratePluginBundleChunks({
        transferId,
        buffer: bytes,
        chunkSize,
        pluginId: record.pluginId,
        version: record.version
      })) {
        await send({
          requestId: crypto.randomUUID(),
          target: options.deviceId,
          from: localDeviceId,
          event: 'file.transfer.chunk',
          payload: chunkPayload
        })
      }

      const totalChunks = fileTransferChunkCount(bytes.length, chunkSize)
      await send({
        requestId: crypto.randomUUID(),
        target: options.deviceId,
        from: localDeviceId,
        event: 'file.transfer.complete',
        payload: {
          transferId,
          kind: 'plugin-bundle',
          pluginId: record.pluginId,
          version: record.version,
          totalChunks
        }
      })

      return {
        success: true,
        pluginId: record.pluginId,
        version: record.version,
        deviceId: options.deviceId,
        artifactRoot: record.artifactRoot,
        transmittedChunks: totalChunks
      }
    },
    readFile: async (options: ReadFileOptions): Promise<ReadFileResult> => {
      const encoding = options.encoding ?? 'utf-8'
      const result = await Filesystem.readFile({
        path: options.path.replace(/^\/+/, ''),
        directory: Directory.Data,
        encoding: Encoding.UTF8
      })
      const raw = result.data
      const content =
        typeof raw === 'string'
          ? raw
          : raw instanceof ArrayBuffer
            ? new TextDecoder().decode(raw)
            : ''
      return { content, encoding: encoding as BufferEncoding }
    },
    startDeviceDiscovery: notSupported,
    stopDeviceDiscovery: notSupported,
    listDiscoveredDevices: notSupported,
    openConnectionTransport: notSupported,
    closeConnectionTransport: notSupported,
    sendConnectionTransportMessage: notSupported,
    getConnectionTransportState: notSupported
  }
}
