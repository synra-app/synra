import { createCapacitorRuntimeAdapter } from './adapters/capacitor-adapter'
import { createElectronMainRuntimeAdapter } from './adapters/electron-main-adapter'
import { createUnsupportedMainAdapter } from './adapters/unsupported-main-adapter'
import type { ConnectionRuntimeAdapter } from './adapter'
import { getHooksRuntimeOptions } from './config'
import { isElectronMainProcess } from './is-electron-main-process'

export function resolveRuntimeAdapter(): ConnectionRuntimeAdapter {
  const options = getHooksRuntimeOptions()
  if (options.adapterFactory) {
    return options.adapterFactory()
  }

  if (isElectronMainProcess()) {
    try {
      return createElectronMainRuntimeAdapter()
    } catch {
      return createUnsupportedMainAdapter()
    }
  }

  return createCapacitorRuntimeAdapter()
}
