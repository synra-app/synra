import { BRIDGE_METHODS } from '../../shared/protocol/constants'
import type { BridgeRequest, MethodPayloadMap, MethodResultMap } from '../../shared/protocol/types'
import type { ExternalLinkService } from '../../host/services/external-link.service'
import type { FileService } from '../../host/services/file.service'
import type { ConnectionService } from '../../host/services/connection.service'
import type { DeviceDiscoveryService } from '../../host/services/device-discovery.service'
import type { PluginCatalogService } from '../../host/services/plugin-catalog.service'
import type { PluginRuntimeService } from '../../host/services/plugin-runtime.service'
import type { PreferencesService } from '../../host/services/preferences.service'

type RuntimeInfoService = ReturnType<
  typeof import('../../host/services/runtime-info.service').createRuntimeInfoService
>

export type BridgeHandlerDependencies = {
  runtimeInfoService: RuntimeInfoService
  externalLinkService: ExternalLinkService
  fileService: FileService
  pluginRuntimeService: PluginRuntimeService
  pluginCatalogService: PluginCatalogService
  deviceDiscoveryService: DeviceDiscoveryService
  connectionService: ConnectionService
  preferencesService: PreferencesService
}

export type BridgeHandlerMap = {
  [K in keyof MethodPayloadMap]: (
    request: BridgeRequest<MethodPayloadMap[K]>
  ) => Promise<MethodResultMap[K]>
}

export function createBridgeHandlers(deps: BridgeHandlerDependencies): BridgeHandlerMap {
  return {
    [BRIDGE_METHODS.runtimeGetInfo]: async () => deps.runtimeInfoService.getRuntimeInfo(),
    [BRIDGE_METHODS.runtimeResolveActions]: async (request) =>
      deps.pluginRuntimeService.resolveActions(request.payload.input),
    [BRIDGE_METHODS.runtimeExecute]: async (request) =>
      deps.pluginRuntimeService.executeSelected({
        sessionId: request.payload.sessionId,
        input: request.payload.input,
        action: request.payload.action,
        messageId: request.payload.messageId,
        traceId: request.payload.traceId,
        timeoutMs: request.payload.timeoutMs
      }),
    [BRIDGE_METHODS.pluginCatalogGet]: async (request) =>
      deps.pluginCatalogService.getCatalog(request.payload),
    [BRIDGE_METHODS.externalOpen]: async (request) =>
      deps.externalLinkService.openExternal(request.payload.url),
    [BRIDGE_METHODS.fileRead]: async (request) =>
      deps.fileService.readFile(request.payload.path, request.payload.encoding),
    [BRIDGE_METHODS.discoveryStart]: async (request) =>
      deps.deviceDiscoveryService.startDiscovery(request.payload),
    [BRIDGE_METHODS.discoveryStop]: async () => deps.deviceDiscoveryService.stopDiscovery(),
    [BRIDGE_METHODS.discoveryList]: async () => deps.deviceDiscoveryService.listDevices(),
    [BRIDGE_METHODS.discoveryProbeConnectable]: async (request) =>
      deps.deviceDiscoveryService.probeConnectable(request.payload),
    [BRIDGE_METHODS.discoveryOpenSession]: async (request) =>
      deps.deviceDiscoveryService.openSession(request.payload),
    [BRIDGE_METHODS.discoveryCloseSession]: async (request) =>
      deps.deviceDiscoveryService.closeSession(request.payload),
    [BRIDGE_METHODS.discoverySendMessage]: async (request) =>
      deps.deviceDiscoveryService.sendMessage(request.payload),
    [BRIDGE_METHODS.discoveryGetSessionState]: async (request) =>
      deps.deviceDiscoveryService.getSessionState(request.payload),
    [BRIDGE_METHODS.discoveryPullHostEvents]: async () =>
      deps.deviceDiscoveryService.pullHostEvents(),
    [BRIDGE_METHODS.connectionOpenSession]: async (request) =>
      deps.connectionService.openSession(request.payload),
    [BRIDGE_METHODS.connectionCloseSession]: async (request) =>
      deps.connectionService.closeSession(request.payload),
    [BRIDGE_METHODS.connectionSendMessage]: async (request) =>
      deps.connectionService.sendMessage(request.payload),
    [BRIDGE_METHODS.connectionGetSessionState]: async (request) =>
      deps.connectionService.getSessionState(request.payload),
    [BRIDGE_METHODS.connectionPullHostEvents]: async () => deps.connectionService.pullHostEvents(),
    [BRIDGE_METHODS.preferencesGet]: async (request) => ({
      value: deps.preferencesService.get(request.payload.key)
    }),
    [BRIDGE_METHODS.preferencesSet]: async (request) => {
      deps.preferencesService.set(request.payload.key, request.payload.value)
      return { success: true as const }
    },
    [BRIDGE_METHODS.preferencesRemove]: async (request) => {
      deps.preferencesService.remove(request.payload.key)
      return { success: true as const }
    }
  }
}
