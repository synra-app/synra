import { BRIDGE_METHODS, BRIDGE_PROTOCOL_VERSION } from '../protocol/constants'
import type { BridgeRequest, BridgeResponse } from '../protocol/types'

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function isBridgeRequest(value: unknown): value is BridgeRequest {
  if (!isObject(value)) {
    return false
  }

  if (typeof value.protocolVersion !== 'string') {
    return false
  }

  if (typeof value.requestId !== 'string' || value.requestId.length === 0) {
    return false
  }

  if (typeof value.method !== 'string' || value.method.length === 0) {
    return false
  }

  return 'payload' in value
}

export function isBridgeResponse(value: unknown): value is BridgeResponse {
  if (!isObject(value)) {
    return false
  }

  if (typeof value.requestId !== 'string') {
    return false
  }

  if (value.ok === true) {
    return 'data' in value
  }

  if (value.ok === false) {
    return (
      isObject(value.error) &&
      typeof value.error.code === 'string' &&
      typeof value.error.message === 'string'
    )
  }

  return false
}

export function isSupportedProtocolVersion(protocolVersion: string): boolean {
  return protocolVersion === BRIDGE_PROTOCOL_VERSION
}

export function isSupportedMethod(method: string): boolean {
  return (
    method === BRIDGE_METHODS.runtimeGetInfo ||
    method === BRIDGE_METHODS.runtimeResolveActions ||
    method === BRIDGE_METHODS.runtimeExecute ||
    method === BRIDGE_METHODS.pluginCatalogGet ||
    method === BRIDGE_METHODS.externalOpen ||
    method === BRIDGE_METHODS.fileRead ||
    method === BRIDGE_METHODS.discoveryStart ||
    method === BRIDGE_METHODS.discoveryStop ||
    method === BRIDGE_METHODS.discoveryList ||
    method === BRIDGE_METHODS.discoveryPair ||
    method === BRIDGE_METHODS.discoveryProbeConnectable ||
    method === BRIDGE_METHODS.discoveryOpenSession ||
    method === BRIDGE_METHODS.discoveryCloseSession ||
    method === BRIDGE_METHODS.discoverySendMessage ||
    method === BRIDGE_METHODS.discoveryGetSessionState ||
    method === BRIDGE_METHODS.discoveryPullHostEvents
  )
}

export function validateResolveActionsPayload(
  payload: unknown
): payload is { input: { type: string; raw: string } } {
  return (
    isObject(payload) &&
    isObject(payload.input) &&
    typeof payload.input.type === 'string' &&
    typeof payload.input.raw === 'string'
  )
}

export function validateRuntimeExecutePayload(payload: unknown): payload is {
  sessionId: string
  input: { type: string; raw: string }
  action: {
    actionId: string
    pluginId: string
    actionType: string
    label: string
    requiresConfirm: boolean
  }
} {
  return (
    isObject(payload) &&
    typeof payload.sessionId === 'string' &&
    payload.sessionId.length > 0 &&
    isObject(payload.input) &&
    typeof payload.input.type === 'string' &&
    typeof payload.input.raw === 'string' &&
    isObject(payload.action) &&
    typeof payload.action.actionId === 'string' &&
    typeof payload.action.pluginId === 'string' &&
    typeof payload.action.actionType === 'string' &&
    typeof payload.action.label === 'string' &&
    typeof payload.action.requiresConfirm === 'boolean'
  )
}

export function validateExternalOpenPayload(payload: unknown): payload is { url: string } {
  return isObject(payload) && typeof payload.url === 'string' && payload.url.length > 0
}

export function validateReadFilePayload(
  payload: unknown
): payload is { path: string; encoding?: BufferEncoding } {
  if (!isObject(payload) || typeof payload.path !== 'string' || payload.path.length === 0) {
    return false
  }

  if (payload.encoding === undefined) {
    return true
  }

  return typeof payload.encoding === 'string'
}

export function validateDiscoveryStartPayload(payload: unknown): payload is {
  includeLoopback?: boolean
  manualTargets?: string[]
  enableProbeFallback?: boolean
  discoveryMode?: 'hybrid' | 'mdns' | 'subnet' | 'manual'
  mdnsServiceType?: string
  subnetCidrs?: string[]
  maxProbeHosts?: number
  concurrency?: number
  discoveryTimeoutMs?: number
  reset?: boolean
  scanWindowMs?: number
  port?: number
  timeoutMs?: number
} {
  if (!isObject(payload)) {
    return false
  }

  if (payload.includeLoopback !== undefined && typeof payload.includeLoopback !== 'boolean') {
    return false
  }

  if (
    payload.manualTargets !== undefined &&
    (!Array.isArray(payload.manualTargets) ||
      payload.manualTargets.some((target) => typeof target !== 'string'))
  ) {
    return false
  }

  if (
    payload.enableProbeFallback !== undefined &&
    typeof payload.enableProbeFallback !== 'boolean'
  ) {
    return false
  }

  if (
    payload.discoveryMode !== undefined &&
    payload.discoveryMode !== 'hybrid' &&
    payload.discoveryMode !== 'mdns' &&
    payload.discoveryMode !== 'subnet' &&
    payload.discoveryMode !== 'manual'
  ) {
    return false
  }

  if (payload.mdnsServiceType !== undefined && typeof payload.mdnsServiceType !== 'string') {
    return false
  }

  if (
    payload.subnetCidrs !== undefined &&
    (!Array.isArray(payload.subnetCidrs) ||
      payload.subnetCidrs.some((cidr) => typeof cidr !== 'string'))
  ) {
    return false
  }

  if (payload.maxProbeHosts !== undefined && typeof payload.maxProbeHosts !== 'number') {
    return false
  }

  if (payload.concurrency !== undefined && typeof payload.concurrency !== 'number') {
    return false
  }

  if (payload.discoveryTimeoutMs !== undefined && typeof payload.discoveryTimeoutMs !== 'number') {
    return false
  }

  if (payload.reset !== undefined && typeof payload.reset !== 'boolean') {
    return false
  }

  if (payload.scanWindowMs !== undefined && typeof payload.scanWindowMs !== 'number') {
    return false
  }

  if (payload.port !== undefined && typeof payload.port !== 'number') {
    return false
  }

  if (payload.timeoutMs !== undefined && typeof payload.timeoutMs !== 'number') {
    return false
  }

  return true
}

export function validateDiscoveryPairPayload(payload: unknown): payload is { deviceId: string } {
  return isObject(payload) && typeof payload.deviceId === 'string' && payload.deviceId.length > 0
}

export function validateDiscoveryOpenSessionPayload(payload: unknown): payload is {
  deviceId: string
  host: string
  port: number
  token?: string
} {
  if (!isObject(payload)) {
    return false
  }

  if (typeof payload.deviceId !== 'string' || payload.deviceId.length === 0) {
    return false
  }

  if (typeof payload.host !== 'string' || payload.host.length === 0) {
    return false
  }

  if (typeof payload.port !== 'number') {
    return false
  }

  if (payload.token !== undefined && typeof payload.token !== 'string') {
    return false
  }

  return true
}

export function validateDiscoverySendMessagePayload(payload: unknown): payload is {
  sessionId: string
  messageType: string
  payload: unknown
  messageId?: string
} {
  if (!isObject(payload)) {
    return false
  }

  if (typeof payload.sessionId !== 'string' || payload.sessionId.length === 0) {
    return false
  }

  if (typeof payload.messageType !== 'string' || payload.messageType.length === 0) {
    return false
  }

  if (payload.payload === undefined) {
    return false
  }

  if (payload.messageId !== undefined && typeof payload.messageId !== 'string') {
    return false
  }

  return true
}
