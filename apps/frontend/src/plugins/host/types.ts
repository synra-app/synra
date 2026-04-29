import type { SynraPlugin, SynraUiManifestMetadata } from '@synra/plugin-sdk'

export type PluginRuntimeState = 'idle' | 'entering' | 'active' | 'exiting'

export type PluginSyncFailureKind =
  | 'artifactBroken'
  | 'registrationFailed'
  | 'activationFailed'
  | 'cleanupFailed'

export type PluginSyncFailure = {
  pluginId: string
  reason: PluginSyncFailureKind
  message: string
  cleanupRecommended: boolean
}

export type PluginSyncReport = {
  registeredPluginIds: string[]
  failedPlugins: PluginSyncFailure[]
}

export type RegisteredPage = {
  pagePath: string
  routeName: string
  loader: () => Promise<{ default: unknown }>
}

export type PagesManifest = {
  pages: Array<{
    path: string
    file: string
  }>
}

export type RegisteredPlugin = {
  plugin: SynraPlugin
  metadata: SynraUiManifestMetadata
  artifactRoot?: string
}
