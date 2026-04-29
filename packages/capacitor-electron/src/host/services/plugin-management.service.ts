import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'pathe'
import { x as extractTar } from 'tar'
import {
  getSynraPluginManifestMetadata,
  isValidSynraPluginPackageName,
  type SynraPluginManifest
} from '@synra/plugin-system'
import {
  createSynraPluginInstallStore,
  type SynraInstalledPluginRecord
} from '@synra/plugin-system/node'
import type {
  PluginInstallOptions,
  PluginInstallResult,
  PluginListInstalledResult,
  PluginSyncToDeviceOptions,
  PluginSyncToDeviceResult,
  PluginUninstallOptions,
  PluginUninstallResult
} from '../../shared/protocol/types'

export type PluginManagementService = {
  install(options: PluginInstallOptions): Promise<PluginInstallResult>
  uninstall(options: PluginUninstallOptions): Promise<PluginUninstallResult>
  listInstalled(): Promise<PluginListInstalledResult>
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

function resolveDefaultRegistryUrl(): string {
  return process.env.SYNRA_PLUGIN_REGISTRY_URL?.trim() || 'https://registry.npmjs.org'
}

function normalizeRegistryUrl(input?: string): string {
  const normalized = (input?.trim() || resolveDefaultRegistryUrl()).replace(/\/+$/, '')
  if (!/^https?:\/\//.test(normalized)) {
    throw new Error(`Invalid registry url '${normalized}'.`)
  }
  return normalized
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

      const registryUrl = normalizeRegistryUrl(input.registryUrl)
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
      mkdirSync(artifactRoot, { recursive: true })

      const tarballUrl = versionDoc.dist?.tarball
      const tarballFilePath = join(artifactRoot, 'package.tgz')
      if (tarballUrl) {
        const tarballBuffer = await fetchArrayBuffer(tarballUrl)
        writeFileSync(tarballFilePath, Buffer.from(tarballBuffer))
        const extractedPackageRoot = join(artifactRoot, 'package')
        if (existsSync(extractedPackageRoot)) {
          rmSync(extractedPackageRoot, { recursive: true, force: true })
        }
        mkdirSync(extractedPackageRoot, { recursive: true })
        await extractTar({
          file: tarballFilePath,
          cwd: extractedPackageRoot,
          strip: 1
        })
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

      return {
        pluginId: installedRecord.pluginId,
        packageName: installedRecord.packageName,
        version: installedRecord.version,
        title: installedRecord.title,
        defaultPage: installedRecord.defaultPage,
        builtin: installedRecord.builtin,
        icon: installedRecord.icon,
        artifactRoot: installedRecord.artifactRoot,
        installedAt: installedRecord.installedAt,
        entries: installedRecord.entries
      }
    },
    async uninstall(optionsToRemove: PluginUninstallOptions): Promise<PluginUninstallResult> {
      return {
        success: installStore.remove(optionsToRemove.pluginId)
      }
    },
    async listInstalled(): Promise<PluginListInstalledResult> {
      return {
        plugins: installStore.list().map((record) => ({
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
