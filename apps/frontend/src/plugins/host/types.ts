import type { SynraPlugin, SynraUiManifestMetadata } from '@synra/plugin-sdk'

export type PluginRuntimeState = 'idle' | 'entering' | 'active' | 'exiting'

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

export type RegisteredBuiltinPlugin = {
  plugin: SynraPlugin
  metadata: SynraUiManifestMetadata
}
