import { BRIDGE_METHODS, BRIDGE_PROTOCOL_VERSION } from '../protocol/constants'
import type { BridgeRequest, BridgeResponse } from '../protocol/types'
import {
  DEVICE_TCP_ACK_EVENT,
  DEVICE_TCP_CLOSE_EVENT,
  DEVICE_TCP_CONNECT_ACK_EVENT,
  DEVICE_TCP_CONNECT_EVENT,
  DEVICE_TCP_ERROR_EVENT,
  DEVICE_TCP_HEARTBEAT_EVENT,
  isLanWireEventName,
  type LanWireEventName
} from '@synra/protocol'

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
    method === BRIDGE_METHODS.connectionOpenTransport ||
    method === BRIDGE_METHODS.connectionCloseTransport ||
    method === BRIDGE_METHODS.connectionSendMessage ||
    method === BRIDGE_METHODS.connectionSendLanEvent ||
    method === BRIDGE_METHODS.connectionGetTransportState ||
    method === BRIDGE_METHODS.connectionPullHostEvents ||
    method === BRIDGE_METHODS.preferencesGet ||
    method === BRIDGE_METHODS.preferencesSet ||
    method === BRIDGE_METHODS.preferencesRemove
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
  requestId: string
  sourceDeviceId: string
  targetDeviceId: string
  replyToRequestId?: string
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
    typeof payload.requestId === 'string' &&
    payload.requestId.length > 0 &&
    typeof payload.sourceDeviceId === 'string' &&
    payload.sourceDeviceId.length > 0 &&
    typeof payload.targetDeviceId === 'string' &&
    payload.targetDeviceId.length > 0 &&
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

  if (payload.port !== undefined && typeof payload.port !== 'number') {
    return false
  }

  if (payload.timeoutMs !== undefined && typeof payload.timeoutMs !== 'number') {
    return false
  }

  return true
}

export function validateDiscoveryOpenTransportPayload(payload: unknown): payload is {
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
  requestId: string
  event: string
  target: string
  from: string
  replyRequestId?: string
  payload: unknown
  timestamp?: number
} {
  // SYNRA-COMM::MESSAGE_ENVELOPE::SEND::SEND_MESSAGE_VALIDATE
  if (!isObject(payload)) {
    return false
  }

  if (typeof payload.requestId !== 'string' || payload.requestId.length === 0) {
    return false
  }
  if (typeof payload.event !== 'string' || payload.event.length === 0) {
    return false
  }
  if (
    payload.event === DEVICE_TCP_CONNECT_EVENT ||
    payload.event === DEVICE_TCP_CONNECT_ACK_EVENT ||
    payload.event === DEVICE_TCP_ACK_EVENT ||
    payload.event === DEVICE_TCP_CLOSE_EVENT ||
    payload.event === DEVICE_TCP_HEARTBEAT_EVENT ||
    payload.event === DEVICE_TCP_ERROR_EVENT
  ) {
    return false
  }
  if (typeof payload.target !== 'string' || payload.target.length === 0) {
    return false
  }
  if (typeof payload.from !== 'string' || payload.from.length === 0) {
    return false
  }

  if (payload.replyRequestId !== undefined && typeof payload.replyRequestId !== 'string') {
    return false
  }

  if (payload.payload === undefined) {
    return false
  }

  if (payload.timestamp !== undefined && typeof payload.timestamp !== 'number') {
    return false
  }

  return true
}

export function validateDiscoverySendLanEventPayload(payload: unknown): payload is {
  requestId: string
  event: LanWireEventName
  target: string
  from: string
  replyRequestId?: string
  payload?: unknown
  timestamp?: number
} {
  // SYNRA-COMM::MESSAGE_ENVELOPE::SEND::SEND_LAN_EVENT_VALIDATE
  if (!isObject(payload)) {
    return false
  }
  if (typeof payload.requestId !== 'string' || payload.requestId.length === 0) {
    return false
  }
  if (typeof payload.event !== 'string' || !isLanWireEventName(payload.event)) {
    return false
  }
  if (typeof payload.target !== 'string' || payload.target.length === 0) {
    return false
  }
  if (typeof payload.from !== 'string' || payload.from.length === 0) {
    return false
  }
  if (payload.replyRequestId !== undefined && typeof payload.replyRequestId !== 'string') {
    return false
  }
  if (payload.timestamp !== undefined && typeof payload.timestamp !== 'number') {
    return false
  }
  return true
}
