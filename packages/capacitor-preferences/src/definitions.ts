export type SynraPreferencesGetOptions = {
  key: string
}

export type SynraPreferencesGetResult = {
  value: string | null
}

export type SynraPreferencesSetOptions = {
  key: string
  value: string
}

export type SynraPreferencesRemoveOptions = {
  key: string
}

export interface SynraPreferencesPlugin {
  get(options: SynraPreferencesGetOptions): Promise<SynraPreferencesGetResult>
  set(options: SynraPreferencesSetOptions): Promise<void>
  remove(options: SynraPreferencesRemoveOptions): Promise<void>
}
