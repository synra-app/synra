import { registerPlugin } from '@capacitor/core'
import type { LanDiscoveryPlugin } from './definitions'

const LanDiscovery = registerPlugin<LanDiscoveryPlugin>('LanDiscovery', {
  web: async () => {
    const [webModule, electronModule] = await Promise.all([import('./web'), import('./electron')])
    const target = globalThis as {
      __synraCapElectron?: {
        invoke?: (...args: unknown[]) => Promise<unknown>
      }
    }
    if (typeof target.__synraCapElectron?.invoke === 'function') {
      return new electronModule.LanDiscoveryElectron()
    }
    return new webModule.LanDiscoveryWeb()
  },
  electron: () => import('./electron').then((module) => new module.LanDiscoveryElectron())
})

export * from './definitions'
export * from './host-event-device'
export { LanDiscovery }
