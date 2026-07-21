/**
 * Canonical IPC bridge wire schema for Synra.
 *
 * This package is a **leaf** — it carries the wire contract
 * (`MethodPayloadMap`, `MethodResultMap`, `BRIDGE_METHODS`, request /
 * response envelopes, error codes, validators) but no runtime code.
 *
 * Why a separate package: `@synra/capacitor-electron` mixes two
 * responsibilities — *the wire contract* (what flows over IPC) and
 * *the runtime implementation* (Electron plugin, adapters, services,
 * plugin-sdk / plugin-system integrations). Anything that wants to
 * type-check against the contract (e.g. `@synra/capacitor-clipboard`)
 * would otherwise be forced to drag the whole runtime stack into its
 * type graph, which breaks tsdown's `dts.emit` graph walk.
 *
 * Splitting the schema into a leaf package keeps the dts graph
 * acyclic for downstream consumers and lets the schema evolve
 * independently of the runtime.
 *
 * @see ../capacitor-electron/src/index.ts — runtime implementation,
 * which re-exports these types so existing imports keep working.
 */

// ─── Protocol version & method catalog ──────────────────────────────────────

export const BRIDGE_PROTOCOL_VERSION = '1.0' as const

export const BRIDGE_SUPPORTED_PROTOCOL_VERSIONS = [BRIDGE_PROTOCOL_VERSION] as const

export const BRIDGE_METHODS = {
  runtimeGetInfo: 'runtime.getInfo',
  runtimeResolveActions: 'runtime.resolveActions',
  runtimeExecute: 'runtime.execute',
  pluginCatalogGet: 'plugin.catalog.get',
  pluginInstall: 'plugin.install',
  pluginInstallLocal: 'plugin.installLocal',
  pluginUninstall: 'plugin.uninstall',
  pluginListInstalled: 'plugin.listInstalled',
  pluginRegisterInstalled: 'plugin.registerInstalled',
  pluginSyncToDevice: 'plugin.syncToDevice',
  externalOpen: 'external.open',
  clipboardRead: 'clipboard.read',
  clipboardReadSelection: 'clipboard.readSelection',
  clipboardWrite: 'clipboard.write',
  fileRead: 'file.read',
  discoveryStart: 'discovery.start',
  discoveryStop: 'discovery.stop',
  discoveryList: 'discovery.list',
  connectionOpenTransport: 'connection.openTransport',
  connectionCloseTransport: 'connection.closeTransport',
  connectionSendMessage: 'connection.sendMessage',
  connectionSendLanEvent: 'connection.sendLanEvent',
  connectionGetTransportState: 'connection.getTransportState',
  preferencesGet: 'preferences.get',
  preferencesSet: 'preferences.set',
  preferencesRemove: 'preferences.remove'
} as const

export type BridgeMethod = (typeof BRIDGE_METHODS)[keyof typeof BRIDGE_METHODS]

// ─── Error codes ────────────────────────────────────────────────────────────

export const BRIDGE_ERROR_CODES = {
  invalidParams: 'INVALID_PARAMS',
  unauthorized: 'UNAUTHORIZED',
  notFound: 'NOT_FOUND',
  timeout: 'TIMEOUT',
  unsupportedOperation: 'UNSUPPORTED_OPERATION',
  internalError: 'INTERNAL_ERROR'
} as const

export type BridgeErrorCode = (typeof BRIDGE_ERROR_CODES)[keyof typeof BRIDGE_ERROR_CODES]

// ─── Error type & helper ────────────────────────────────────────────────────

export type BridgeErrorDetails = {
  retryable?: boolean
  supportedVersions?: string[]
  capabilityKey?: string
  [key: string]: unknown
}

export class BridgeError extends Error {
  public readonly code: BridgeErrorCode
  public readonly details?: BridgeErrorDetails

  public constructor(code: BridgeErrorCode, message: string, details?: BridgeErrorDetails) {
    super(message)
    this.name = 'BridgeError'
    this.code = code
    this.details = details
  }
}

export function toBridgeError(error: unknown): BridgeError {
  if (error instanceof BridgeError) {
    return error
  }

  if (error instanceof Error) {
    return new BridgeError(BRIDGE_ERROR_CODES.internalError, error.message)
  }

  return new BridgeError(BRIDGE_ERROR_CODES.internalError, 'Unexpected error.')
}

// ─── Request / Response envelopes ──────────────────────────────────────────

export type BridgeRequestMeta = {
  timeoutMs?: number
  source?: 'capacitor-webview'
  traceId?: string
}

export type BridgeRequest<TPayload = unknown> = {
  protocolVersion: string
  requestId: string
  method: BridgeMethod | (string & {})
  payload: TPayload
  meta?: BridgeRequestMeta
}

export type BridgeSuccessResponse<TData = unknown> = {
  ok: true
  requestId: string
  data: TData
}

export type BridgeErrorResponse = {
  ok: false
  requestId: string
  error: {
    code: BridgeErrorCode
    message: string
    details?: unknown
  }
}

export type BridgeResponse<TData = unknown> = BridgeSuccessResponse<TData> | BridgeErrorResponse

// ─── Validators (type guards over `unknown`) ───────────────────────────────

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

/**
 * Source of truth for supported methods is `BRIDGE_METHODS` (a frozen
 * object). Whitelisting by `Object.values` keeps this list in lockstep
 * with the constant — adding a new method only requires editing
 * `BRIDGE_METHODS` above, not also maintaining a parallel string union
 * here. Cast through `string` so the `has` check accepts the unknown
 * incoming `method`; the dispatch handler narrows back to
 * `BridgeMethod` after this gate passes.
 */
const SUPPORTED_METHODS: ReadonlySet<string> = new Set(Object.values(BRIDGE_METHODS))

export function isSupportedMethod(method: string): boolean {
  return SUPPORTED_METHODS.has(method)
}

// ─── Payload / Result shapes (per-method wire types) ───────────────────────

import type {
  LanWireEventName,
  PluginCatalogItem,
  PluginCatalogRequestPayload,
  SynraActionReceipt,
  SynraRuntimeMessage
} from '@synra/protocol'
import type { PluginAction, ShareInput } from '@synra/plugin-sdk'
import type { SynraPluginInstallSource, SynraPluginManifestEntries } from '@synra/plugin-system'

export type RuntimeInfo = {
  protocolVersion: string
  supportedProtocolVersions: string[]
  capacitorVersion: string
  electronVersion: string
  nodeVersion: string
  platform: NodeJS.Platform
  capabilities: string[]
  /** Prefer non-link-local IPv4 for LAN pairing (Electron main). */
  primaryDiscoveryIpv4?: string
}

export type OperationResult = {
  success: true
}

export type OpenExternalOptions = {
  url: string
}

export type ReadClipboardResult = {
  /** Plain-text clipboard content from the host OS clipboard. */
  text: string
}

export type WriteClipboardOptions = {
  /** Plain-text content to put on the host OS clipboard. */
  text: string
}

export type ReadFileOptions = {
  path: string
  encoding?: BufferEncoding
}

export type ReadFileResult = {
  content: string
  encoding: BufferEncoding
}

export type RuntimeActionCandidate = {
  pluginId: string
  pluginVersion: string
  pluginLabel: string
  score: number
  reason?: string
  action: PluginAction
}

export type ResolveRuntimeActionsOptions = {
  input: ShareInput
}

export type ResolveRuntimeActionsResult = {
  candidates: RuntimeActionCandidate[]
}

export type RuntimeExecuteOptions = {
  requestId: string
  sourceDeviceId: string
  targetDeviceId: string
  replyToRequestId?: string
  input: ShareInput
  action: PluginAction
  messageId?: string
  traceId?: string
  timeoutMs?: number
}

export type RuntimeExecuteResult = {
  messages: SynraRuntimeMessage[]
  receipt: SynraActionReceipt
}

export type PluginCatalogResult = {
  plugins: PluginCatalogItem[]
  generatedAt: number
}

export type InstalledPluginSummary = {
  pluginId: string
  packageName: string
  version: string
  title: string
  defaultPage: string
  builtin: boolean
  icon?: string
  installedAt: number
  artifactRoot: string
  entries: SynraPluginManifestEntries
  installSource: SynraPluginInstallSource
  localSourcePath?: string
}

export type PluginInstallOptions = {
  packageName: string
  version?: string
  registryUrl?: string
}

export type PluginInstallResult = InstalledPluginSummary

export type PluginInstallLocalOptions = {
  path: string
}

export type PluginUninstallOptions = {
  pluginId: string
}

export type PluginUninstallResult = {
  success: boolean
}

export type PluginListInstalledOptions = Record<string, never>

export type PluginListInstalledResult = {
  plugins: InstalledPluginSummary[]
}

export type PluginRegisterFailureReason = 'artifactBroken' | 'registrationFailed'

export type PluginRegisterFailure = {
  pluginId: string
  reason: PluginRegisterFailureReason
  message: string
  cleanupRecommended: boolean
}

export type PluginRegisterInstalledOptions = {
  plugins: InstalledPluginSummary[]
  requestId?: string
}

export type PluginRegisterInstalledResult = {
  registeredPluginIds: string[]
  failedPlugins: PluginRegisterFailure[]
}

export type PluginSyncToDeviceOptions = {
  pluginId: string
  deviceId: string
}

/** Bridge result for pushing a plugin bundle to a peer (includes tarball transfer on Electron). */
export type PluginSyncToDeviceResult =
  | {
      success: true
      pluginId: string
      version: string
      deviceId: string
      artifactRoot: string
      /** Number of file.transfer.chunk messages sent (set after transfer completes). */
      transmittedChunks?: number
    }
  | {
      success: false
      /** e.g. missingPackageTarball, or prefixed missingPackageTarball: … */
      reason: string
    }

export type DiscoverySource = 'mdns' | 'probe' | 'manual' | 'transport'
export type DiscoveryMode = 'hybrid' | 'mdns' | 'subnet' | 'manual'

export type DiscoveryState = 'idle' | 'scanning'

export type DiscoveredDevice = {
  deviceId: string
  name: string
  ipAddress: string
  port?: number
  source: DiscoverySource
  connectable: boolean
  connectCheckAt?: number
  connectCheckError?: string
  discoveredAt: number
  lastSeenAt: number
}

export type DeviceDiscoveryStartOptions = {
  includeLoopback?: boolean
  manualTargets?: string[]
  enableProbeFallback?: boolean
  discoveryMode?: DiscoveryMode
  mdnsServiceType?: string
  subnetCidrs?: string[]
  maxProbeHosts?: number
  concurrency?: number
  /** Single wall-clock budget (ms) for strategy browse + Synra TCP probe. */
  scanBudgetMs?: number
  reset?: boolean
  port?: number
  /** Merged into each Synra TCP probe `connect` payload during this discovery run. */
  probeConnectWirePayload?: Record<string, unknown>
}

export type DeviceDiscoveryStartResult = {
  requestId: string
  state: DiscoveryState
  devices: DiscoveredDevice[]
}

export type DeviceDiscoveryListResult = {
  state: DiscoveryState
  devices: DiscoveredDevice[]
}

export type SynraLanConnectType = 'fresh' | 'paired'

export type DeviceTransportOpenOptions = {
  deviceId: string
  host: string
  port: number
  token?: string
  /** Sent on Synra `connect` payload as `connectType`; caller must set. */
  connectType: SynraLanConnectType
  transport?: ConnectionTransport
}

export type DeviceTransportState = 'idle' | 'connecting' | 'open' | 'closed' | 'error'
export type ConnectionTransport = 'tcp'

export type DeviceTransportSnapshot = {
  deviceId?: string
  host?: string
  port?: number
  state: DeviceTransportState
  direction?: 'inbound' | 'outbound'
  transport?: ConnectionTransport
  lastError?: string
  openedAt?: number
  closedAt?: number
}

export type DeviceTransportOpenResult = {
  success: true
  deviceId: string
  state: DeviceTransportState
  transport?: ConnectionTransport
}

export type DeviceTransportCloseOptions = {
  target?: string
  transport?: ConnectionTransport
}

export type DeviceTransportCloseResult = {
  success: true
  target?: string
  transport?: ConnectionTransport
}

export type DeviceTransportSendMessageOptions = {
  requestId: string
  event: string
  target: string
  from: string
  replyRequestId?: string
  payload: unknown
  timestamp?: number
  transport?: ConnectionTransport
}

export type DeviceTransportSendMessageResult = {
  success: true
  target: string
  transport?: ConnectionTransport
}

export type DeviceTransportSendLanEventOptions = {
  requestId: string
  event: LanWireEventName
  target: string
  from: string
  replyRequestId?: string
  payload?: unknown
  timestamp?: number
  transport?: ConnectionTransport
}

export type DeviceTransportSendLanEventResult = {
  success: true
  target: string
  transport?: ConnectionTransport
}

export type DeviceTransportGetStateOptions = {
  target?: string
  transport?: ConnectionTransport
}

export type DeviceDiscoveryHostEvent = {
  id: number
  timestamp: number
  type:
    | 'transport.opened'
    | 'transport.closed'
    | 'transport.message.received'
    | 'transport.lan.event.received'
    | 'transport.message.ack'
    | 'transport.error'
    | 'host.member.online'
    | 'host.retire'
    | 'host.member.offline'
    | 'host.heartbeat.timeout'
  event?: string
  target?: string
  from?: string
  replyRequestId?: string
  deviceId?: string
  code?: string
  payload?: unknown
  transport?: ConnectionTransport
}

// ─── Canonical payload / result maps (the heart of the schema) ─────────────

export type MethodPayloadMap = {
  'runtime.getInfo': Record<string, never>
  'runtime.resolveActions': ResolveRuntimeActionsOptions
  'runtime.execute': RuntimeExecuteOptions
  'plugin.catalog.get': PluginCatalogRequestPayload
  'plugin.install': PluginInstallOptions
  'plugin.installLocal': PluginInstallLocalOptions
  'plugin.uninstall': PluginUninstallOptions
  'plugin.listInstalled': PluginListInstalledOptions
  'plugin.registerInstalled': PluginRegisterInstalledOptions
  'plugin.syncToDevice': PluginSyncToDeviceOptions
  'external.open': OpenExternalOptions
  'clipboard.read': Record<string, never>
  'clipboard.readSelection': Record<string, never>
  'clipboard.write': WriteClipboardOptions
  'file.read': ReadFileOptions
  'discovery.start': DeviceDiscoveryStartOptions
  'discovery.stop': Record<string, never>
  'discovery.list': Record<string, never>
  'connection.openTransport': DeviceTransportOpenOptions
  'connection.closeTransport': DeviceTransportCloseOptions
  'connection.sendMessage': DeviceTransportSendMessageOptions
  'connection.sendLanEvent': DeviceTransportSendLanEventOptions
  'connection.getTransportState': DeviceTransportGetStateOptions
  'preferences.get': { key: string }
  'preferences.set': { key: string; value: string }
  'preferences.remove': { key: string }
}

export type MethodResultMap = {
  'runtime.getInfo': RuntimeInfo
  'runtime.resolveActions': ResolveRuntimeActionsResult
  'runtime.execute': RuntimeExecuteResult
  'plugin.catalog.get': PluginCatalogResult
  'plugin.install': PluginInstallResult
  'plugin.installLocal': PluginInstallResult
  'plugin.uninstall': PluginUninstallResult
  'plugin.listInstalled': PluginListInstalledResult
  'plugin.registerInstalled': PluginRegisterInstalledResult
  'plugin.syncToDevice': PluginSyncToDeviceResult
  'external.open': OperationResult
  'clipboard.read': ReadClipboardResult
  'clipboard.readSelection': ReadClipboardResult
  'clipboard.write': OperationResult
  'file.read': ReadFileResult
  'discovery.start': DeviceDiscoveryStartResult
  'discovery.stop': OperationResult
  'discovery.list': DeviceDiscoveryListResult
  'connection.openTransport': DeviceTransportOpenResult
  'connection.closeTransport': DeviceTransportCloseResult
  'connection.sendMessage': DeviceTransportSendMessageResult
  'connection.sendLanEvent': DeviceTransportSendLanEventResult
  'connection.getTransportState': DeviceTransportSnapshot
  'preferences.get': { value: string | null }
  'preferences.set': OperationResult
  'preferences.remove': OperationResult
}
