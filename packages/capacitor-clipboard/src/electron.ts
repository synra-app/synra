import { WebPlugin } from '@capacitor/core'
import type {
  SynraClipboardPlugin,
  SynraClipboardReadResult,
  SynraClipboardWriteOptions
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

type ClipboardBridgeMethods = {
  'clipboard.read': { payload: Record<string, never>; result: SynraClipboardReadResult }
  'clipboard.write': { payload: SynraClipboardWriteOptions; result: void }
}

export class SynraClipboardElectron extends WebPlugin implements SynraClipboardPlugin {
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

  private async invokeBridge<TMethod extends keyof ClipboardBridgeMethods>(
    method: TMethod,
    payload: ClipboardBridgeMethods[TMethod]['payload']
  ): Promise<ClipboardBridgeMethods[TMethod]['result']> {
    const inv = this.resolveInvoke()
    return inv(method, payload) as Promise<ClipboardBridgeMethods[TMethod]['result']>
  }

  async read(): Promise<SynraClipboardReadResult> {
    return this.invokeBridge('clipboard.read', {})
  }

  async write(options: SynraClipboardWriteOptions): Promise<void> {
    await this.invokeBridge('clipboard.write', options)
  }
}
