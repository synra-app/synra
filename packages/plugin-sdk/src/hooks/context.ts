import type { SynraHooksAdapter, SynraHooksAdapterFactory } from './types'

let hooksAdapterFactory: SynraHooksAdapterFactory | null = null

export function configureSynraHooks(
  adapterOrFactory: SynraHooksAdapter | SynraHooksAdapterFactory
): void {
  hooksAdapterFactory =
    typeof adapterOrFactory === 'function' ? adapterOrFactory : () => adapterOrFactory
}

export function resetSynraHooks(): void {
  hooksAdapterFactory = null
}

export function useSynraHooksAdapter(): SynraHooksAdapter {
  if (!hooksAdapterFactory) {
    throw new Error(
      'Synra hooks adapter is not configured. Call configureSynraHooks(...) from the host app before using @synra/plugin-sdk/hooks.'
    )
  }
  return hooksAdapterFactory()
}
