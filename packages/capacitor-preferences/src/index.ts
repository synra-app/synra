import { registerPlugin } from '@capacitor/core'
import type { SynraPreferencesPlugin } from './definitions'

const SynraPreferences = registerPlugin<SynraPreferencesPlugin>('SynraPreferences', {
  web: async () => {
    const [webModule, electronModule] = await Promise.all([import('./web'), import('./electron')])
    const target = globalThis as {
      __synraCapElectron?: { invoke?: (...args: unknown[]) => Promise<unknown> }
    }
    if (typeof target.__synraCapElectron?.invoke === 'function') {
      return new electronModule.SynraPreferencesElectron()
    }
    return new webModule.SynraPreferencesWeb()
  },
  electron: () => import('./electron').then((m) => new m.SynraPreferencesElectron())
})

export * from './constants'
export * from './definitions'
export { SynraPreferences }
