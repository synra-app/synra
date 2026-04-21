import {
  getSynraUiManifestMetadata,
  type SynraPlugin,
  type SynraPluginManifest
} from '@synra/plugin-sdk'
import type { RegisteredBuiltinPlugin } from './types'

export function registerBuiltinPluginFromManifest(
  manifest: SynraPluginManifest,
  plugin: SynraPlugin
): RegisteredBuiltinPlugin {
  return {
    plugin,
    metadata: getSynraUiManifestMetadata(manifest)
  }
}
