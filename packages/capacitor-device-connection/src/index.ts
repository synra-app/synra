import { registerPlugin } from '@capacitor/core'
import type { DeviceConnectionPlugin } from './definitions'

const DeviceConnection = registerPlugin<DeviceConnectionPlugin>('DeviceConnection', {
  web: async () => {
    const [webModule, electronModule] = await Promise.all([import('./web'), import('./electron')])
    const target = globalThis as {
      __synraCapElectron?: {
        invoke?: (...args: unknown[]) => Promise<unknown>
      }
    }
    if (typeof target.__synraCapElectron?.invoke === 'function') {
      return new electronModule.DeviceConnectionElectron()
    }
    return new webModule.DeviceConnectionWeb()
  },
  electron: () => import('./electron').then((module) => new module.DeviceConnectionElectron())
})

export * from './definitions'
export { DeviceConnection }
