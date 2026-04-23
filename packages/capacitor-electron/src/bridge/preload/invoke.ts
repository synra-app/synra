import { BridgeError } from '../../shared/errors/bridge-error'
import { BRIDGE_ERROR_CODES } from '../../shared/errors/codes'
import {
  BRIDGE_INVOKE_CHANNEL,
  BRIDGE_METHODS,
  BRIDGE_PROTOCOL_VERSION
} from '../../shared/protocol/constants'
import type { BridgeMethod } from '../../shared/protocol/constants'
import type {
  BridgeRequest,
  BridgeResponse,
  MethodPayloadMap,
  MethodResultMap
} from '../../shared/protocol/types'
import {
  isBridgeResponse,
  validateResolveActionsPayload,
  validateRuntimeExecutePayload,
  validateExternalOpenPayload,
  validateDiscoverySendLanEventPayload,
  validateDiscoverySendMessagePayload,
  validateReadFilePayload
} from '../../shared/schema/validators'

export type IpcInvoke = (channel: string, request: BridgeRequest) => Promise<unknown>

export type InvokeOptions = {
  timeoutMs?: number
  signal?: AbortSignal
}

function createRequestId(): string {
  const webCrypto = globalThis.crypto
  if (webCrypto && typeof webCrypto.randomUUID === 'function') {
    return webCrypto.randomUUID()
  }

  return `req-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function validatePayload(method: string, payload: unknown): void {
  if (
    method === BRIDGE_METHODS.runtimeGetInfo &&
    (payload === null || typeof payload !== 'object')
  ) {
    throw new BridgeError(
      BRIDGE_ERROR_CODES.invalidParams,
      'runtime.getInfo expects an object payload.'
    )
  }

  if (method === BRIDGE_METHODS.externalOpen && !validateExternalOpenPayload(payload)) {
    throw new BridgeError(BRIDGE_ERROR_CODES.invalidParams, 'external.open expects { url }.')
  }

  if (method === BRIDGE_METHODS.runtimeResolveActions && !validateResolveActionsPayload(payload)) {
    throw new BridgeError(
      BRIDGE_ERROR_CODES.invalidParams,
      'runtime.resolveActions expects { input: { type, raw } }.'
    )
  }

  if (method === BRIDGE_METHODS.runtimeExecute && !validateRuntimeExecutePayload(payload)) {
    throw new BridgeError(
      BRIDGE_ERROR_CODES.invalidParams,
      'runtime.execute expects { requestId, sourceDeviceId, targetDeviceId, input, action }.'
    )
  }

  if (method === BRIDGE_METHODS.fileRead && !validateReadFilePayload(payload)) {
    throw new BridgeError(
      BRIDGE_ERROR_CODES.invalidParams,
      'file.read expects { path, encoding? }.'
    )
  }

  if (
    method === BRIDGE_METHODS.connectionSendMessage &&
    !validateDiscoverySendMessagePayload(payload)
  ) {
    throw new BridgeError(
      BRIDGE_ERROR_CODES.invalidParams,
      'connection.sendMessage expects { requestId, sourceDeviceId, targetDeviceId, messageType, payload, messageId? }.'
    )
  }

  if (
    method === BRIDGE_METHODS.connectionSendLanEvent &&
    !validateDiscoverySendLanEventPayload(payload)
  ) {
    throw new BridgeError(
      BRIDGE_ERROR_CODES.invalidParams,
      'connection.sendLanEvent expects { requestId, sourceDeviceId, targetDeviceId, eventName, payload?, eventId?, schemaVersion? }.'
    )
  }
}

export function createPreloadInvoker(ipcInvoke: IpcInvoke) {
  return async function invoke<TMethod extends keyof MethodPayloadMap>(
    method: TMethod,
    payload: MethodPayloadMap[TMethod],
    options: InvokeOptions = {}
  ): Promise<MethodResultMap[TMethod]> {
    validatePayload(method, payload)

    if (options.signal?.aborted) {
      throw new BridgeError(BRIDGE_ERROR_CODES.timeout, 'Request aborted before dispatch.')
    }

    const request: BridgeRequest = {
      protocolVersion: BRIDGE_PROTOCOL_VERSION,
      requestId: createRequestId(),
      method: method as BridgeMethod,
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
            options.signal?.addEventListener(
              'abort',
              () => {
                reject(new BridgeError(BRIDGE_ERROR_CODES.timeout, 'Request aborted.'))
              },
              { once: true }
            )
          })
        ])
      : responsePromise

    const rawResponse = await guardedPromise

    if (!isBridgeResponse(rawResponse)) {
      throw new BridgeError(BRIDGE_ERROR_CODES.internalError, 'Invalid bridge response shape.')
    }

    const response = rawResponse as BridgeResponse<MethodResultMap[TMethod]>

    if (!response.ok) {
      throw new BridgeError(response.error.code, response.error.message, {
        ...(typeof response.error.details === 'object'
          ? (response.error.details as Record<string, unknown>)
          : {})
      })
    }

    return response.data
  }
}
