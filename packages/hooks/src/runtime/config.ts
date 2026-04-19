import type { ConnectionRuntimeAdapter } from './adapter'

export type HooksRuntimeOptions = {
  adapterFactory?: () => ConnectionRuntimeAdapter
}

let configuredOptions: HooksRuntimeOptions = {}

export function configureHooksRuntime(options: HooksRuntimeOptions): void {
  configuredOptions = { ...configuredOptions, ...options }
}

export function getHooksRuntimeOptions(): HooksRuntimeOptions {
  return configuredOptions
}

export function resetHooksRuntimeOptions(): void {
  configuredOptions = {}
}
