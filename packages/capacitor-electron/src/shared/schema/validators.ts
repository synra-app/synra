/**
 * Re-export the wire-schema validators from `@synra/bridge-schema`,
 * then keep the runtime-specific payload validators here.
 *
 * The runtime validators (`validateResolveActionsPayload`,
 * `validateReadFilePayload`, etc.) are *not* part of the wire contract —
 * they exist to type-guard an `unknown` payload coming from
 * `connectionService.sendMessage` callers before it crosses the IPC
 * bridge, so they stay alongside the dispatch logic in this package.
 */
export {
  isBridgeRequest,
  isBridgeResponse,
  isSupportedProtocolVersion,
  isSupportedMethod
} from '@synra/bridge-schema'

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

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
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

export function validateReadClipboardPayload(payload: unknown): payload is Record<string, never> {
  // clipboard.read takes no arguments; accept either an empty object or undefined/null
  // so the host does not reject the call when the caller omits the payload.
  if (payload === undefined || payload === null) {
    return true
  }
  return isObject(payload) && Object.keys(payload).length === 0
}

// NOTE: `clipboard.readSelection` shares the empty-payload contract
// with `clipboard.read`; it deliberately reuses `validateReadClipboardPayload`
// rather than introducing a parallel function. If selection ever grows
// its own arguments, add a dedicated validator here and route the new
// method through it.

export function validateWriteClipboardPayload(payload: unknown): payload is { text: string } {
  return isObject(payload) && typeof payload.text === 'string'
}

// `apps.listInstalled` takes no arguments — mirror the
// `validateReadClipboardPayload` "accept undefined / empty object"
// convention so renderer callers can omit the payload without
// rejection.
export function validateAppListInstalledPayload(
  payload: unknown
): payload is Record<string, never> {
  if (payload === undefined || payload === null) return true
  return isObject(payload) && Object.keys(payload).length === 0
}

// `apps.launch` takes a single non-empty string `appId`. We do NOT
// validate the structure of `appId` (no path-traversal blocking
// here) — the apps-service treats it as an opaque lookup key into a
// list it itself produced via `apps.listInstalled`.
export function validateAppLaunchPayload(payload: unknown): payload is { appId: string } {
  return isObject(payload) && typeof payload.appId === 'string' && payload.appId.trim().length > 0
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
  scanBudgetMs?: number
  reset?: boolean
  port?: number
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

  if (payload.scanBudgetMs !== undefined && typeof payload.scanBudgetMs !== 'number') {
    return false
  }

  if (payload.reset !== undefined && typeof payload.reset !== 'boolean') {
    return false
  }

  if (payload.port !== undefined && typeof payload.port !== 'number') {
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
  if (typeof payload.from !== 'string' || !isUuidLike(payload.from.trim())) {
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
  if (typeof payload.from !== 'string' || !isUuidLike(payload.from.trim())) {
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
