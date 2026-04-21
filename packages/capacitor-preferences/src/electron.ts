import { WebPlugin } from '@capacitor/core'
import type {
  SynraPreferencesGetOptions,
  SynraPreferencesGetResult,
  SynraPreferencesPlugin,
  SynraPreferencesRemoveOptions,
  SynraPreferencesSetOptions
} from './definitions'

type ElectronBridgeTarget = {
  __synraCapElectron?: {
    invoke?: (
      method: string,
      payload: unknown,
      options?: { timeoutMs?: number; signal?: AbortSignal }
    ) => Promise<unknown>
  }
}

type PreferencesBridgeMethods = {
  'preferences.get': { payload: SynraPreferencesGetOptions; result: SynraPreferencesGetResult }
  'preferences.set': { payload: SynraPreferencesSetOptions; result: void }
  'preferences.remove': { payload: SynraPreferencesRemoveOptions; result: void }
}

export class SynraPreferencesElectron extends WebPlugin implements SynraPreferencesPlugin {
  private invoke:
    | ((
        method: string,
        payload: unknown,
        options?: { timeoutMs?: number; signal?: AbortSignal }
      ) => Promise<unknown>)
    | undefined

  private resolveInvoke() {
    if (this.invoke) {
      return this.invoke
    }
    const target = globalThis as unknown as ElectronBridgeTarget
    const fn = target.__synraCapElectron?.invoke
    if (typeof fn !== 'function') {
      throw this.unavailable('Electron bridge is unavailable.')
    }
    this.invoke = fn
    return fn
  }

  private async invokeBridge<TMethod extends keyof PreferencesBridgeMethods>(
    method: TMethod,
    payload: PreferencesBridgeMethods[TMethod]['payload']
  ): Promise<PreferencesBridgeMethods[TMethod]['result']> {
    const inv = this.resolveInvoke()
    return inv(method, payload) as Promise<PreferencesBridgeMethods[TMethod]['result']>
  }

  async get(options: SynraPreferencesGetOptions): Promise<SynraPreferencesGetResult> {
    return this.invokeBridge('preferences.get', options)
  }

  async set(options: SynraPreferencesSetOptions): Promise<void> {
    await this.invokeBridge('preferences.set', options)
  }

  async remove(options: SynraPreferencesRemoveOptions): Promise<void> {
    await this.invokeBridge('preferences.remove', options)
  }
}
