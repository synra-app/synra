import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'pathe'
import { x as extractTar } from 'tar'
import {
  getSynraPluginManifestMetadata,
  isValidSynraPluginPackageName,
  resolveSynraPluginUiEntryAbsolutePath,
  type SynraPluginManifest
} from '@synra/plugin-system'
import {
  createSynraPluginInstallStore,
  type SynraInstalledPluginRecord
} from '@synra/plugin-system/node'
import type {
  PluginInstallOptions,
  PluginInstallLocalOptions,
  PluginInstallResult,
  PluginListInstalledResult,
  PluginRegisterInstalledOptions,
  PluginRegisterInstalledResult,
  PluginSyncToDeviceOptions,
  PluginSyncToDeviceResult,
  PluginUninstallOptions,
  PluginUninstallResult
} from '../../shared/protocol/types'
import { resolvePluginRegistryUrl } from './plugin-registry'

export type PluginManagementService = {
  install(options: PluginInstallOptions): Promise<PluginInstallResult>
  installFromLocalPath(options: PluginInstallLocalOptions): Promise<PluginInstallResult>
  uninstall(options: PluginUninstallOptions): Promise<PluginUninstallResult>
  listInstalled(): Promise<PluginListInstalledResult>
  registerInstalled(options: PluginRegisterInstalledOptions): Promise<PluginRegisterInstalledResult>
  syncToDevice(options: PluginSyncToDeviceOptions): Promise<PluginSyncToDeviceResult>
}

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

function resolvePluginStorageRoots(rootDir?: string): {
  pluginRootDir: string
  installStorePath: string
} {
  const base = rootDir ?? join(homedir(), '.synra', 'plugins')
  return {
    pluginRootDir: base,
    installStorePath: join(base, 'installed.json')
  }
}

function toManifestFromNpmVersionDoc(doc: NpmPackageVersionDoc): SynraPluginManifest {
  return {
    name: doc.name,
    version: doc.version,
    synra: doc.synra
  }
}

function toInstallResult(record: SynraInstalledPluginRecord): PluginInstallResult {
  return {
    pluginId: record.pluginId,
    packageName: record.packageName,
    version: record.version,
    title: record.title,
    defaultPage: record.defaultPage,
    builtin: record.builtin,
    icon: record.icon,
    artifactRoot: record.artifactRoot,
    installedAt: record.installedAt,
    entries: record.entries
  }
}

function resolveLocalPackageRoot(inputPath: string): string {
  const normalizedPath = inputPath.trim().replace(/\\/g, '/')
  if (!normalizedPath) {
    throw new Error('Local plugin path is required.')
  }
  const directPackageJson = join(normalizedPath, 'package.json')
  if (existsSync(directPackageJson)) {
    return normalizedPath
  }
  const nestedPackageRoot = join(normalizedPath, 'package')
  const nestedPackageJson = join(nestedPackageRoot, 'package.json')
  if (existsSync(nestedPackageJson)) {
    return nestedPackageRoot
  }
  throw new Error(`Cannot find package.json in local plugin path '${inputPath}'.`)
}

function readLocalPluginManifest(packageRoot: string): SynraPluginManifest {
  const packageJsonPath = join(packageRoot, 'package.json')
  const parsed = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as SynraPluginManifest
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`Invalid package.json in '${packageRoot}'.`)
  }
  return parsed
}

function removeDirectoryIfEmpty(path: string): void {
  if (!existsSync(path)) {
    return
  }
  if (readdirSync(path).length === 0) {
    rmSync(path, { recursive: true, force: true })
  }
}

function cleanupArtifactDirectory(
  artifactRoot: string,
  pluginRootDir: string,
  pluginId: string
): void {
  rmSync(artifactRoot, { recursive: true, force: true })
  removeDirectoryIfEmpty(join(pluginRootDir, pluginId))
}

function ensureInstalledArtifactIntegrity(
  artifactRoot: string,
  entries: SynraInstalledPluginRecord['entries']
): void {
  const packageRoot = join(artifactRoot, 'package')
  if (!existsSync(packageRoot)) {
    throw new Error(
      `Installed artifact is incomplete at '${artifactRoot}': missing package directory.`
    )
  }
  const uiEntryPath = resolveSynraPluginUiEntryAbsolutePath(artifactRoot, entries)
  if (!existsSync(uiEntryPath)) {
    throw new Error(`Installed artifact is incomplete at '${artifactRoot}': missing UI entry.`)
  }
}

export function createPluginManagementService(
  options: { rootDir?: string } = {}
): PluginManagementService {
  const storage = resolvePluginStorageRoots(options.rootDir)
  const installStore = createSynraPluginInstallStore(storage.installStorePath)

  return {
    async install(input: PluginInstallOptions): Promise<PluginInstallResult> {
      const packageName = input.packageName.trim()
      if (!isValidSynraPluginPackageName(packageName)) {
        throw new Error(
          `Invalid plugin package name '${packageName}'. Expected @synra-plugin/* or synra-plugin-* with lowercase letters, numbers and dashes.`
        )
      }

      const registryUrl = resolvePluginRegistryUrl(input.registryUrl)
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
      const artifactRoot = join(
        storage.pluginRootDir,
        manifestMetadata.pluginId,
        manifestMetadata.version
      )
      const tarballUrl = versionDoc.dist?.tarball
      if (!tarballUrl) {
        throw new Error(
          `Cannot install '${packageName}@${resolvedVersion}': npm metadata is missing dist.tarball.`
        )
      }

      const stagingArtifactRoot = `${artifactRoot}.staging-${Date.now()}`
      const tarballFilePath = join(stagingArtifactRoot, 'package.tgz')
      rmSync(stagingArtifactRoot, { recursive: true, force: true })
      mkdirSync(stagingArtifactRoot, { recursive: true })
      try {
        const tarballBuffer = await fetchArrayBuffer(tarballUrl)
        writeFileSync(tarballFilePath, Buffer.from(tarballBuffer))
        const extractedPackageRoot = join(stagingArtifactRoot, 'package')
        if (existsSync(extractedPackageRoot)) {
          rmSync(extractedPackageRoot, { recursive: true, force: true })
        }
        mkdirSync(extractedPackageRoot, { recursive: true })
        await extractTar({
          file: tarballFilePath,
          cwd: extractedPackageRoot,
          strip: 1
        })
        ensureInstalledArtifactIntegrity(stagingArtifactRoot, manifestMetadata.entries)
        rmSync(artifactRoot, { recursive: true, force: true })
        renameSync(stagingArtifactRoot, artifactRoot)
      } catch (error) {
        rmSync(stagingArtifactRoot, { recursive: true, force: true })
        cleanupArtifactDirectory(artifactRoot, storage.pluginRootDir, manifestMetadata.pluginId)
        throw error
      }

      const installedRecord: SynraInstalledPluginRecord = {
        pluginId: manifestMetadata.pluginId,
        packageName: manifestMetadata.packageName,
        version: manifestMetadata.version,
        title: manifestMetadata.title,
        defaultPage: manifestMetadata.defaultPage,
        builtin: manifestMetadata.builtin,
        icon: manifestMetadata.icon,
        installedAt: Date.now(),
        artifactRoot,
        entries: manifestMetadata.entries,
        hash: versionDoc.dist?.shasum
      }
      installStore.upsert(installedRecord)

      return toInstallResult(installedRecord)
    },
    async installFromLocalPath(input: PluginInstallLocalOptions): Promise<PluginInstallResult> {
      const packageRoot = resolveLocalPackageRoot(input.path)
      const manifest = readLocalPluginManifest(packageRoot)
      const metadata = getSynraPluginManifestMetadata(manifest)
      const artifactRoot = join(storage.pluginRootDir, metadata.pluginId, metadata.version)
      const stagingArtifactRoot = `${artifactRoot}.staging-${Date.now()}`
      const stagingPackageRoot = join(stagingArtifactRoot, 'package')
      rmSync(stagingArtifactRoot, { recursive: true, force: true })
      mkdirSync(stagingArtifactRoot, { recursive: true })
      try {
        cpSync(packageRoot, stagingPackageRoot, { recursive: true, force: true })
        ensureInstalledArtifactIntegrity(stagingArtifactRoot, metadata.entries)
        rmSync(artifactRoot, { recursive: true, force: true })
        renameSync(stagingArtifactRoot, artifactRoot)
      } catch (error) {
        rmSync(stagingArtifactRoot, { recursive: true, force: true })
        cleanupArtifactDirectory(artifactRoot, storage.pluginRootDir, metadata.pluginId)
        throw error
      }
      const installedRecord: SynraInstalledPluginRecord = {
        pluginId: metadata.pluginId,
        packageName: metadata.packageName,
        version: metadata.version,
        title: metadata.title,
        defaultPage: metadata.defaultPage,
        builtin: metadata.builtin,
        icon: metadata.icon,
        installedAt: Date.now(),
        artifactRoot,
        entries: metadata.entries
      }
      installStore.upsert(installedRecord)
      return toInstallResult(installedRecord)
    },
    async uninstall(optionsToRemove: PluginUninstallOptions): Promise<PluginUninstallResult> {
      const installed = installStore.get(optionsToRemove.pluginId)
      if (!installed) {
        return { success: false }
      }
      cleanupArtifactDirectory(installed.artifactRoot, storage.pluginRootDir, installed.pluginId)
      return {
        success: installStore.remove(optionsToRemove.pluginId)
      }
    },
    async listInstalled(): Promise<PluginListInstalledResult> {
      const validRecords: SynraInstalledPluginRecord[] = []
      for (const record of installStore.list()) {
        try {
          ensureInstalledArtifactIntegrity(record.artifactRoot, record.entries)
          validRecords.push(record)
        } catch {
          cleanupArtifactDirectory(record.artifactRoot, storage.pluginRootDir, record.pluginId)
          installStore.remove(record.pluginId)
        }
      }
      return {
        plugins: validRecords.map((record) => ({
          pluginId: record.pluginId,
          packageName: record.packageName,
          version: record.version,
          title: record.title,
          defaultPage: record.defaultPage,
          builtin: record.builtin,
          icon: record.icon,
          installedAt: record.installedAt,
          artifactRoot: record.artifactRoot,
          entries: record.entries ?? {}
        }))
      }
    },
    async registerInstalled(
      optionsToRegister: PluginRegisterInstalledOptions
    ): Promise<PluginRegisterInstalledResult> {
      const registeredPluginIds: string[] = []
      const failedPlugins: PluginRegisterInstalledResult['failedPlugins'] = []
      for (const plugin of optionsToRegister.plugins) {
        try {
          const uiEntryPath = resolveSynraPluginUiEntryAbsolutePath(
            plugin.artifactRoot,
            plugin.entries
          )
          const uiEntryExists = existsSync(uiEntryPath)
          if (!uiEntryExists) {
            failedPlugins.push({
              pluginId: plugin.pluginId,
              reason: 'artifactBroken',
              message: `Plugin UI entry is missing: '${uiEntryPath}'.`,
              cleanupRecommended: true
            })
            continue
          }
          registeredPluginIds.push(plugin.pluginId)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          const artifactBroken =
            message.includes('Installed artifact is incomplete') ||
            message.includes('ENOENT') ||
            message.includes('no such file or directory')
          failedPlugins.push({
            pluginId: plugin.pluginId,
            reason: artifactBroken ? 'artifactBroken' : 'registrationFailed',
            message,
            cleanupRecommended: artifactBroken
          })
        }
      }
      return {
        registeredPluginIds,
        failedPlugins
      }
    },
    async syncToDevice(
      optionsToSync: PluginSyncToDeviceOptions
    ): Promise<PluginSyncToDeviceResult> {
      const record = installStore.get(optionsToSync.pluginId)
      if (!record) {
        return {
          success: false,
          reason: `Plugin '${optionsToSync.pluginId}' is not installed.`
        }
      }
      return {
        success: true,
        pluginId: record.pluginId,
        version: record.version,
        deviceId: optionsToSync.deviceId,
        artifactRoot: record.artifactRoot
      }
    }
  }
}
