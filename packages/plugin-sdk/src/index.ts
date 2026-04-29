import type { SynraActionReceipt, SynraActionRequest } from '@synra/protocol'
import {
  getSynraPluginManifestMetadata,
  parsePluginIdFromPackageName,
  type SynraPluginEntryKind,
  type SynraPluginManifest,
  type SynraPluginManifestEntries,
  type SynraPluginPackageName
} from '@synra/plugin-system'

export type ShareInputType = 'text' | 'url' | 'file'

export type ShareInput = {
  type: ShareInputType
  raw: string
  metadata?: Record<string, unknown>
}

export type PluginMatchResult = {
  matched: boolean
  score: number
  reason?: string
}

export type PluginAction = SynraActionRequest & {
  label: string
  requiresConfirm: boolean
}

export type ExecuteContext = {
  deviceId: string
  traceId: string
}

export type SynraActionPlugin = {
  id: string
  version: string
  meta?: {
    packageName?: string
    displayName?: string
    builtin?: boolean
    defaultPage?: string
    icon?: string
    manifest?: SynraPluginManifest
  }
  supports(input: ShareInput): Promise<PluginMatchResult>
  buildActions(input: ShareInput): Promise<PluginAction[]>
  execute(action: PluginAction, context: ExecuteContext): Promise<SynraActionReceipt>
}

export type SynraUiManifestMetadata = {
  pluginId: string
  packageName: SynraPluginPackageName
  version: string
  title: string
  builtin: boolean
  defaultPage: string
  icon?: string
  entries: SynraPluginManifestEntries
}

export abstract class SynraPlugin {
  onPluginEnter(): void | Promise<void> {}
  onPluginExit(): void | Promise<void> {}
}

export function getSynraUiManifestMetadata(manifest: SynraPluginManifest): SynraUiManifestMetadata {
  return getSynraPluginManifestMetadata(manifest)
}

export function getSynraPluginMetaFromManifest(
  manifest: SynraPluginManifest
): NonNullable<SynraActionPlugin['meta']> {
  const metadata = getSynraUiManifestMetadata(manifest)
  return {
    packageName: metadata.packageName,
    displayName: metadata.title,
    builtin: metadata.builtin,
    defaultPage: metadata.defaultPage,
    icon: metadata.icon,
    manifest
  }
}

export type { SynraPluginManifest, SynraPluginManifestEntries, SynraPluginEntryKind }
export { parsePluginIdFromPackageName }

export { normalizePluginPagePath, pluginFilePathToPagePath } from './page-path'

export type {
  PluginWorkerActionInvokeInput,
  PluginWorkerClient,
  PluginWorkerRuntime,
  PluginWorkerTaskRequest,
  PluginWorkerTaskResult,
  LocalTaskExecutor,
  WorkerRuntimeOptions
} from './worker-runtime'
export {
  createPluginWorkerClient,
  disposePluginWorker,
  FallbackWorkerRuntime,
  invokePluginAction,
  WorkerProxyRuntime
} from './worker-runtime'
