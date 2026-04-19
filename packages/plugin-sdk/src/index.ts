import type {
  SynraActionReceipt,
  SynraActionRequest,
  SynraCrossDeviceMessage,
  SynraMessageType
} from '@synra/protocol'

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
  sessionId: string
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

export type SynraPluginPackageName = `@synra-plugin/${string}` | `synra-plugin-${string}`

export type SynraPluginManifest = {
  name: string
  version: string
  synra?: {
    title?: string
    description?: string
    defaultPage?: string
    builtin?: boolean
    icon?: string
  }
}

export type SynraUiManifestMetadata = {
  pluginId: string
  packageName: SynraPluginPackageName
  version: string
  title: string
  builtin: boolean
  defaultPage: string
  icon?: string
}

export abstract class SynraPlugin {
  onPluginEnter(): void | Promise<void> {}
  onPluginExit(): void | Promise<void> {}
}

export type HostCapabilityPort = {
  sendCrossDeviceMessage<TType extends SynraMessageType>(
    message: SynraCrossDeviceMessage<TType>
  ): Promise<void>
  subscribeCrossDeviceMessage<TType extends SynraMessageType>(
    type: TType,
    handler: (message: SynraCrossDeviceMessage<TType>) => void | Promise<void>
  ): () => void | Promise<void>
}

export function toActionSelectedMessage(
  input: Omit<SynraCrossDeviceMessage<'action.selected'>, 'type' | 'payload'> & {
    payload: PluginAction
  }
): SynraCrossDeviceMessage<'action.selected'> {
  return {
    ...input,
    type: 'action.selected',
    payload: input.payload
  }
}

export function parsePluginIdFromPackageName(packageName: string): string | null {
  const scopedPrefix = '@synra-plugin/'
  const unscopedPrefix = 'synra-plugin-'
  let candidate = ''

  if (packageName.startsWith(scopedPrefix)) {
    candidate = packageName.slice(scopedPrefix.length)
  } else if (packageName.startsWith(unscopedPrefix)) {
    candidate = packageName.slice(unscopedPrefix.length)
  } else {
    return null
  }

  if (!/^[a-z0-9-]+$/.test(candidate)) {
    return null
  }

  return candidate
}

export function getSynraUiManifestMetadata(manifest: SynraPluginManifest): SynraUiManifestMetadata {
  const pluginId = parsePluginIdFromPackageName(manifest.name)
  if (!pluginId) {
    throw new Error(
      `Cannot derive pluginId from package name '${manifest.name}'. Expected @synra-plugin/<id> or synra-plugin-<id>.`
    )
  }

  return {
    pluginId,
    packageName: manifest.name as SynraPluginPackageName,
    version: manifest.version,
    title: manifest.synra?.title ?? pluginId,
    builtin: manifest.synra?.builtin ?? false,
    defaultPage: manifest.synra?.defaultPage ?? 'home',
    icon: manifest.synra?.icon
  }
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

export function normalizePluginPagePath(pagePath: string): string {
  const normalized = pagePath.startsWith('/') ? pagePath : `/${pagePath}`
  return normalized.replace(/\/+/g, '/')
}

export type {
  PluginWorkerRuntime,
  PluginWorkerTaskRequest,
  PluginWorkerTaskResult,
  LocalTaskExecutor,
  WorkerRuntimeOptions
} from './worker-runtime'
export { FallbackWorkerRuntime, WorkerProxyRuntime } from './worker-runtime'
