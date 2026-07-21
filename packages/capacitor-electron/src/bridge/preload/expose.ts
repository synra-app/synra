import type { MethodPayloadMap, MethodResultMap } from '../../shared/protocol/types'
import type { PreloadBridgeApi, PreloadBridgeInvoke } from '@synra/plugin-sdk'

/**
 * Re-exported so consumers of `@synra/capacitor-electron` continue to
 * see the same names. The canonical definitions live in
 * `@synra/plugin-sdk/host-utils` so plugin bundles can type the
 * `__synraCapElectron` global without a runtime dep on this package.
 */
export type { PreloadBridgeApi, PreloadBridgeInvoke }

export type PreloadExposeTarget = {
  __synraCapElectron?: PreloadBridgeApi
}

/**
 * Tightly-typed preload invoke shape — narrows `method` against
 * `MethodPayloadMap` / `MethodResultMap` so the renderer-side bridge
 * client (`invokeBridge` in `@synra/capacitor-clipboard`, plugin
 * `bridge.send`, etc.) gets full type-safety on `method` + `payload`.
 */
export type TypedPreloadBridgeInvoke = <TMethod extends keyof MethodPayloadMap>(
  method: TMethod,
  payload: MethodPayloadMap[TMethod],
  options?: { timeoutMs?: number; signal?: AbortSignal }
) => Promise<MethodResultMap[TMethod]>

export function exposePreloadBridge(
  invoke: TypedPreloadBridgeInvoke,
  target: PreloadExposeTarget = globalThis as unknown as PreloadExposeTarget
): void {
  // The preload-side `onHostEvent` is wired separately via
  // `BRIDGE_HOST_EVENT_CHANNEL` (host events flow over a dedicated
  // IPC, not the invoke bridge); this install path only attaches the
  // `invoke` channel.
  target.__synraCapElectron = {
    invoke: invoke as unknown as PreloadBridgeInvoke
  }
}
