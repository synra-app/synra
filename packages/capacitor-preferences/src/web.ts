import { WebPlugin } from '@capacitor/core'
import { SYNRA_PREFERENCES_STORAGE_PREFIX } from './constants'
import type {
  SynraPreferencesGetOptions,
  SynraPreferencesGetResult,
  SynraPreferencesPlugin,
  SynraPreferencesRemoveOptions,
  SynraPreferencesSetOptions
} from './definitions'

function storageKey(key: string): string {
  return `${SYNRA_PREFERENCES_STORAGE_PREFIX}${key}`
}

export class SynraPreferencesWeb extends WebPlugin implements SynraPreferencesPlugin {
  async get(options: SynraPreferencesGetOptions): Promise<SynraPreferencesGetResult> {
    const raw = globalThis.localStorage?.getItem(storageKey(options.key))
    return { value: raw ?? null }
  }

  async set(options: SynraPreferencesSetOptions): Promise<void> {
    globalThis.localStorage?.setItem(storageKey(options.key), options.value)
  }

  async remove(options: SynraPreferencesRemoveOptions): Promise<void> {
    globalThis.localStorage?.removeItem(storageKey(options.key))
  }
}
