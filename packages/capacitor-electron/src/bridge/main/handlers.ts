import { BRIDGE_METHODS } from '../../shared/protocol/constants'
import type { BridgeRequest, MethodPayloadMap, MethodResultMap } from '../../shared/protocol/types'
import type { ExternalLinkService } from '../../host/services/external-link.service'
import type { ClipboardService } from '../../host/services/clipboard.service'
import type { FileService } from '../../host/services/file.service'
import type { ConnectionService } from '../../host/services/connection.service'
import type { DeviceDiscoveryService } from '../../host/services/device-discovery.service'
import type { PluginCatalogService } from '../../host/services/plugin-catalog.service'
import type { PluginManagementService } from '../../host/services/plugin-management.service'
import type { PluginRuntimeService } from '../../host/services/plugin-runtime.service'
import type { PreferencesService } from '../../host/services/preferences.service'
import { fileTransferChunkCount, iteratePluginBundleChunks } from '@synra/protocol'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'pathe'

type RuntimeInfoService = ReturnType<
  typeof import('../../host/services/runtime-info.service').createRuntimeInfoService
>

export type BridgeHandlerDependencies = {
  runtimeInfoService: RuntimeInfoService
  externalLinkService: ExternalLinkService
  clipboardService: ClipboardService
  fileService: FileService
  pluginRuntimeService: PluginRuntimeService
  pluginCatalogService: PluginCatalogService
  pluginManagementService: PluginManagementService
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
        requestId: request.payload.requestId,
        sourceDeviceId: request.payload.sourceDeviceId,
        targetDeviceId: request.payload.targetDeviceId,
        replyToRequestId: request.payload.replyToRequestId,
        input: request.payload.input,
        action: request.payload.action,
        messageId: request.payload.messageId,
        traceId: request.payload.traceId,
        timeoutMs: request.payload.timeoutMs
      }),
    [BRIDGE_METHODS.pluginCatalogGet]: async (request) =>
      deps.pluginCatalogService.getCatalog(request.payload),
    [BRIDGE_METHODS.pluginInstall]: async (request) =>
      deps.pluginManagementService.install(request.payload),
    [BRIDGE_METHODS.pluginInstallLocal]: async (request) =>
      deps.pluginManagementService.installFromLocalPath(request.payload),
    [BRIDGE_METHODS.pluginUninstall]: async (request) =>
      deps.pluginManagementService.uninstall(request.payload),
    [BRIDGE_METHODS.pluginListInstalled]: async () => deps.pluginManagementService.listInstalled(),
    [BRIDGE_METHODS.pluginRegisterInstalled]: async (request) =>
      deps.pluginManagementService.registerInstalled(request.payload),
    [BRIDGE_METHODS.pluginSyncToDevice]: async (request) => {
      // SYNRA-COMM::PLUGIN_BRIDGE::SEND::PLUGIN_SYNC_TO_DEVICE
      // Receive side reassembly: SYNRA-COMM::FILE_TRANSFER::RECEIVE::ASSEMBLE_BUFFER (see @synra/protocol PluginBundleTransferAssembly).
      const synced = await deps.pluginManagementService.syncToDevice(request.payload)
      if (!synced.success) {
        return synced
      }

      try {
        await deps.pluginManagementService.ensurePluginBundleTarball(synced.artifactRoot)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.warn('[synra:bridge] plugin.syncToDevice: cannot ensure package.tgz', {
          pluginId: synced.pluginId,
          artifactRoot: synced.artifactRoot,
          message
        })
        return {
          success: false as const,
          reason: `missingPackageTarball: ${message}`
        }
      }

      const bundlePath = join(synced.artifactRoot, 'package.tgz')
      if (!existsSync(bundlePath)) {
        console.warn('[synra:bridge] plugin.syncToDevice: package.tgz missing after ensure', {
          pluginId: synced.pluginId,
          artifactRoot: synced.artifactRoot
        })
        return {
          success: false as const,
          reason: 'missingPackageTarball'
        }
      }

      const localDeviceId = deps.preferencesService.ensureDeviceInstanceUuid()
      const bundleBuffer = readFileSync(bundlePath)
      const chunkSize = 64 * 1024
      const transferId = crypto.randomUUID()
      const bytes = new Uint8Array(bundleBuffer)

      await deps.connectionService.sendMessage({
        requestId: crypto.randomUUID(),
        target: synced.deviceId,
        from: localDeviceId,
        event: 'file.transfer.request',
        payload: {
          transferId,
          kind: 'plugin-bundle',
          pluginId: synced.pluginId,
          version: synced.version,
          byteLength: bytes.length
        }
      })

      for (const chunkPayload of iteratePluginBundleChunks({
        transferId,
        buffer: bytes,
        chunkSize,
        pluginId: synced.pluginId,
        version: synced.version
      })) {
        // SYNRA-COMM::FILE_TRANSFER::SEND::CHUNK_ENCODE (iteratePluginBundleChunks)
        await deps.connectionService.sendMessage({
          requestId: crypto.randomUUID(),
          target: synced.deviceId,
          from: localDeviceId,
          event: 'file.transfer.chunk',
          payload: chunkPayload
        })
      }

      const totalChunks = fileTransferChunkCount(bytes.length, chunkSize)

      await deps.connectionService.sendMessage({
        requestId: crypto.randomUUID(),
        target: synced.deviceId,
        from: localDeviceId,
        event: 'file.transfer.complete',
        payload: {
          transferId,
          kind: 'plugin-bundle',
          pluginId: synced.pluginId,
          version: synced.version,
          totalChunks
        }
      })

      return {
        ...synced,
        transmittedChunks: totalChunks
      }
    },
    [BRIDGE_METHODS.externalOpen]: async (request) =>
      deps.externalLinkService.openExternal(request.payload.url),
    [BRIDGE_METHODS.clipboardRead]: async () => deps.clipboardService.readText(),
    [BRIDGE_METHODS.clipboardReadSelection]: async () => deps.clipboardService.readSelection(),
    [BRIDGE_METHODS.clipboardWrite]: async (request) => {
      await deps.clipboardService.writeText(request.payload.text)
      return { success: true as const }
    },
    [BRIDGE_METHODS.fileRead]: async (request) =>
      deps.fileService.readFile(request.payload.path, request.payload.encoding),
    [BRIDGE_METHODS.discoveryStart]: async (request) =>
      deps.deviceDiscoveryService.startDiscovery(request.payload),
    [BRIDGE_METHODS.discoveryStop]: async () => deps.deviceDiscoveryService.stopDiscovery(),
    [BRIDGE_METHODS.discoveryList]: async () => deps.deviceDiscoveryService.listDevices(),
    [BRIDGE_METHODS.connectionOpenTransport]: async (request) =>
      deps.connectionService.openTransport(request.payload),
    [BRIDGE_METHODS.connectionCloseTransport]: async (request) =>
      deps.connectionService.closeTransport(request.payload),
    [BRIDGE_METHODS.connectionSendMessage]: async (request) =>
      deps.connectionService.sendMessage(request.payload),
    [BRIDGE_METHODS.connectionSendLanEvent]: async (request) =>
      deps.connectionService.sendLanEvent(request.payload),
    [BRIDGE_METHODS.connectionGetTransportState]: async (request) =>
      deps.connectionService.getTransportState(request.payload),
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
