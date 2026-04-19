import type { MethodPayloadMap, MethodResultMap } from '@synra/capacitor-electron'

export const BRIDGE_PROTOCOL_VERSION = '1.0' as const
export const BRIDGE_INVOKE_CHANNEL = 'synra:cap-electron:v1:invoke' as const
export const BRIDGE_HOST_EVENT_CHANNEL = 'synra:cap-electron:v1:host-event' as const

type BridgeRequest = {
  protocolVersion: string
  requestId: string
  method: string
  payload: unknown
  meta: {
    timeoutMs?: number
    source: 'capacitor-webview'
  }
}

type BridgeResponse<TData = unknown> =
  | { ok: true; requestId: string; data: TData }
  | { ok: false; requestId: string; error: { code: string; message: string } }

export type InvokeOptions = {
  timeoutMs?: number
  signal?: AbortSignal
}

export type IpcInvoke = (channel: string, request: BridgeRequest) => Promise<unknown>

function createRequestId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID()
  }
  return `req-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function isBridgeResponse(value: unknown): value is BridgeResponse {
  return typeof value === 'object' && value !== null && 'ok' in value && 'requestId' in value
}

export function createPreloadInvoker(ipcInvoke: IpcInvoke) {
  return async function invoke<TMethod extends keyof MethodPayloadMap>(
    method: TMethod,
    payload: MethodPayloadMap[TMethod],
    options: InvokeOptions = {}
  ): Promise<MethodResultMap[TMethod]> {
    const request: BridgeRequest = {
      protocolVersion: BRIDGE_PROTOCOL_VERSION,
      requestId: createRequestId(),
      method,
      payload,
      meta: {
        timeoutMs: options.timeoutMs,
        source: 'capacitor-webview'
      }
    }
    const responsePromise = ipcInvoke(BRIDGE_INVOKE_CHANNEL, request)
    const guardedPromise = options.signal
      ? Promise.race([
          responsePromise,
          new Promise<never>((_resolve, reject) => {
            options.signal?.addEventListener('abort', () => reject(new Error('Request aborted.')), {
              once: true
            })
          })
        ])
      : responsePromise
    const raw = await guardedPromise
    if (!isBridgeResponse(raw)) {
      throw new Error('Invalid bridge response shape.')
    }
    if (!raw.ok) {
      throw new Error(raw.error?.message ?? 'Bridge request failed.')
    }
    return raw.data as MethodResultMap[TMethod]
  }
}
