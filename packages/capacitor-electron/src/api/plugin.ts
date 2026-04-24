import { BridgeError } from '../shared/errors/bridge-error'
import { BRIDGE_ERROR_CODES } from '../shared/errors/codes'
import type {
  DeviceDiscoveryListResult,
  DeviceTransportCloseOptions,
  DeviceTransportCloseResult,
  DeviceTransportGetStateOptions,
  DeviceTransportOpenOptions,
  DeviceTransportOpenResult,
  DeviceTransportSendMessageOptions,
  DeviceTransportSendMessageResult,
  DeviceTransportSnapshot,
  DeviceDiscoveryPullHostEventsResult,
  DeviceDiscoveryStartOptions,
  DeviceDiscoveryStartResult,
  MethodPayloadMap,
  MethodResultMap,
  OpenExternalOptions,
  PluginCatalogResult,
  ReadFileOptions,
  ReadFileResult,
  ResolveRuntimeActionsOptions,
  ResolveRuntimeActionsResult,
  RuntimeExecuteOptions,
  RuntimeExecuteResult,
  RuntimeInfo
} from '../shared/protocol/types'
import { API_METHODS } from './methods'

export type BridgeInvoke = <TMethod extends keyof MethodPayloadMap>(
  method: TMethod,
  payload: MethodPayloadMap[TMethod],
  options?: { timeoutMs?: number; signal?: AbortSignal }
) => Promise<MethodResultMap[TMethod]>

export interface ElectronBridgePlugin {
  getRuntimeInfo(options?: { timeoutMs?: number; signal?: AbortSignal }): Promise<RuntimeInfo>
  resolveRuntimeActions(
    options: ResolveRuntimeActionsOptions,
    invokeOptions?: { timeoutMs?: number; signal?: AbortSignal }
  ): Promise<ResolveRuntimeActionsResult>
  executeRuntimeAction(
    options: RuntimeExecuteOptions,
    invokeOptions?: { timeoutMs?: number; signal?: AbortSignal }
  ): Promise<RuntimeExecuteResult>
  getPluginCatalog(options?: {
    knownPluginIds?: string[]
    timeoutMs?: number
    signal?: AbortSignal
  }): Promise<PluginCatalogResult>
  openExternal(
    options: OpenExternalOptions,
    invokeOptions?: { timeoutMs?: number; signal?: AbortSignal }
  ): Promise<{
    success: true
  }>
  readFile(
    options: ReadFileOptions,
    invokeOptions?: { timeoutMs?: number; signal?: AbortSignal }
  ): Promise<ReadFileResult>
  startDeviceDiscovery(
    options?: DeviceDiscoveryStartOptions,
    invokeOptions?: { timeoutMs?: number; signal?: AbortSignal }
  ): Promise<DeviceDiscoveryStartResult>
  stopDeviceDiscovery(invokeOptions?: {
    timeoutMs?: number
    signal?: AbortSignal
  }): Promise<{ success: true }>
  listDiscoveredDevices(invokeOptions?: {
    timeoutMs?: number
    signal?: AbortSignal
  }): Promise<DeviceDiscoveryListResult>
  openConnectionTransport(
    options: DeviceTransportOpenOptions,
    invokeOptions?: { timeoutMs?: number; signal?: AbortSignal }
  ): Promise<DeviceTransportOpenResult>
  closeConnectionTransport(
    options?: DeviceTransportCloseOptions,
    invokeOptions?: { timeoutMs?: number; signal?: AbortSignal }
  ): Promise<DeviceTransportCloseResult>
  sendConnectionTransportMessage(
    options: DeviceTransportSendMessageOptions,
    invokeOptions?: { timeoutMs?: number; signal?: AbortSignal }
  ): Promise<DeviceTransportSendMessageResult>
  getConnectionTransportState(
    options?: DeviceTransportGetStateOptions,
    invokeOptions?: { timeoutMs?: number; signal?: AbortSignal }
  ): Promise<DeviceTransportSnapshot>
  pullConnectionHostEvents(invokeOptions?: {
    timeoutMs?: number
    signal?: AbortSignal
  }): Promise<DeviceDiscoveryPullHostEventsResult>
}

function ensureObject(value: unknown, errorMessage: string): void {
  if (typeof value !== 'object' || value === null) {
    throw new BridgeError(BRIDGE_ERROR_CODES.invalidParams, errorMessage)
  }
}

export function createElectronBridgePlugin(invoke: BridgeInvoke): ElectronBridgePlugin {
  return {
    async getRuntimeInfo(options = {}): Promise<RuntimeInfo> {
      return invoke(API_METHODS.getRuntimeInfo, {}, options)
    },
    async openExternal(
      options: OpenExternalOptions,
      invokeOptions: { timeoutMs?: number; signal?: AbortSignal } = {}
    ): Promise<{ success: true }> {
      ensureObject(options, 'openExternal options must be an object.')
      return invoke(API_METHODS.openExternal, options, invokeOptions)
    },
    async resolveRuntimeActions(
      options: ResolveRuntimeActionsOptions,
      invokeOptions: { timeoutMs?: number; signal?: AbortSignal } = {}
    ): Promise<ResolveRuntimeActionsResult> {
      ensureObject(options, 'resolveRuntimeActions options must be an object.')
      return invoke(API_METHODS.resolveRuntimeActions, options, invokeOptions)
    },
    async executeRuntimeAction(
      options: RuntimeExecuteOptions,
      invokeOptions: { timeoutMs?: number; signal?: AbortSignal } = {}
    ): Promise<RuntimeExecuteResult> {
      ensureObject(options, 'executeRuntimeAction options must be an object.')
      return invoke(API_METHODS.executeRuntimeAction, options, invokeOptions)
    },
    async getPluginCatalog(
      options: {
        knownPluginIds?: string[]
        timeoutMs?: number
        signal?: AbortSignal
      } = {}
    ): Promise<PluginCatalogResult> {
      return invoke(
        API_METHODS.getPluginCatalog,
        {
          knownPluginIds: options.knownPluginIds
        },
        options
      )
    },
    async readFile(
      options: ReadFileOptions,
      invokeOptions: { timeoutMs?: number; signal?: AbortSignal } = {}
    ): Promise<ReadFileResult> {
      ensureObject(options, 'readFile options must be an object.')
      return invoke(API_METHODS.readFile, options, invokeOptions)
    },
    async startDeviceDiscovery(
      options: DeviceDiscoveryStartOptions = {},
      invokeOptions: { timeoutMs?: number; signal?: AbortSignal } = {}
    ): Promise<DeviceDiscoveryStartResult> {
      ensureObject(options, 'startDeviceDiscovery options must be an object.')
      return invoke(API_METHODS.startDeviceDiscovery, options, invokeOptions)
    },
    async stopDeviceDiscovery(
      invokeOptions: { timeoutMs?: number; signal?: AbortSignal } = {}
    ): Promise<{ success: true }> {
      return invoke(API_METHODS.stopDeviceDiscovery, {}, invokeOptions)
    },
    async listDiscoveredDevices(
      invokeOptions: { timeoutMs?: number; signal?: AbortSignal } = {}
    ): Promise<DeviceDiscoveryListResult> {
      return invoke(API_METHODS.listDiscoveredDevices, {}, invokeOptions)
    },
    async openConnectionTransport(
      options: DeviceTransportOpenOptions,
      invokeOptions: { timeoutMs?: number; signal?: AbortSignal } = {}
    ): Promise<DeviceTransportOpenResult> {
      ensureObject(options, 'openConnectionTransport options must be an object.')
      return invoke(API_METHODS.openConnectionTransport, options, invokeOptions)
    },
    async closeConnectionTransport(
      options: DeviceTransportCloseOptions = {},
      invokeOptions: { timeoutMs?: number; signal?: AbortSignal } = {}
    ): Promise<DeviceTransportCloseResult> {
      ensureObject(options, 'closeConnectionTransport options must be an object.')
      return invoke(API_METHODS.closeConnectionTransport, options, invokeOptions)
    },
    async sendConnectionTransportMessage(
      options: DeviceTransportSendMessageOptions,
      invokeOptions: { timeoutMs?: number; signal?: AbortSignal } = {}
    ): Promise<DeviceTransportSendMessageResult> {
      ensureObject(options, 'sendConnectionTransportMessage options must be an object.')
      return invoke(API_METHODS.sendConnectionTransportMessage, options, invokeOptions)
    },
    async getConnectionTransportState(
      options: DeviceTransportGetStateOptions = {},
      invokeOptions: { timeoutMs?: number; signal?: AbortSignal } = {}
    ): Promise<DeviceTransportSnapshot> {
      ensureObject(options, 'getConnectionTransportState options must be an object.')
      return invoke(API_METHODS.getConnectionTransportState, options, invokeOptions)
    },
    async pullConnectionHostEvents(
      invokeOptions: { timeoutMs?: number; signal?: AbortSignal } = {}
    ): Promise<DeviceDiscoveryPullHostEventsResult> {
      return invoke(API_METHODS.pullConnectionHostEvents, {}, invokeOptions)
    }
  }
}

type GlobalBridgeTarget = {
  __synraCapElectron?: { invoke?: BridgeInvoke }
}

export function createElectronBridgePluginFromGlobal(
  target: GlobalBridgeTarget = globalThis as unknown as GlobalBridgeTarget
): ElectronBridgePlugin {
  const invoke = target.__synraCapElectron?.invoke

  if (!invoke) {
    throw new BridgeError(
      BRIDGE_ERROR_CODES.internalError,
      'Preload bridge is not available on global target.'
    )
  }

  return createElectronBridgePlugin(invoke)
}
