import {
  createFileSystemAdapter,
  type FileSystemAdapter
} from '../../host/adapters/file-system.adapter'
import { createShellAdapter, type ShellAdapter } from '../../host/adapters/electron-shell.adapter'
import { createExternalLinkService } from '../../host/services/external-link.service'
import { createFileService } from '../../host/services/file.service'
import { createConnectionService } from '../../host/services/connection.service'
import { createDeviceDiscoveryService } from '../../host/services/device-discovery.service'
import { createGitHubOpenPlugin } from '../../host/plugins/github-open.plugin'
import { createPluginCatalogService } from '../../host/services/plugin-catalog.service'
import { createPluginRuntimeService } from '../../host/services/plugin-runtime.service'
import { createRuntimeInfoService } from '../../host/services/runtime-info.service'
import type { DeviceDiscoveryHostEvent } from '../../shared/protocol/types'
import type { BridgeLogger } from '../../shared/observability/logger'
import { createMainDispatcher } from './dispatch'
import { createBridgeHandlers } from './handlers'
import { registerBridgeHandlers, type IpcMainLike } from './register'

export type BridgeRuntimeOptions = {
  shellAdapter?: ShellAdapter
  fileSystemAdapter?: FileSystemAdapter
  allowedFileRoots?: string[]
  logger?: BridgeLogger
  capacitorVersion?: string
  electronVersion?: string
  onDiscoveryHostEvent?: (event: DeviceDiscoveryHostEvent) => void
}

export function setupBridgeMainRuntime(
  ipcMainLike: IpcMainLike,
  options: BridgeRuntimeOptions = {}
) {
  const shellAdapter = options.shellAdapter ?? createShellAdapter()
  const fileSystemAdapter = options.fileSystemAdapter ?? createFileSystemAdapter()

  const runtimeInfoService = createRuntimeInfoService({
    capacitorVersion: options.capacitorVersion,
    electronVersion: options.electronVersion
  })
  const externalLinkService = createExternalLinkService(shellAdapter)
  const fileService = createFileService(fileSystemAdapter, {
    allowedRoots: options.allowedFileRoots
  })
  const deviceDiscoveryService = createDeviceDiscoveryService({
    onHostEvent: options.onDiscoveryHostEvent
  })
  const connectionService = createConnectionService(deviceDiscoveryService)
  const pluginRuntimeService = createPluginRuntimeService()
  pluginRuntimeService.register(createGitHubOpenPlugin(externalLinkService))
  const pluginCatalogService = createPluginCatalogService(pluginRuntimeService)

  const handlers = createBridgeHandlers({
    runtimeInfoService,
    externalLinkService,
    fileService,
    pluginRuntimeService,
    pluginCatalogService,
    deviceDiscoveryService,
    connectionService
  })

  const dispatch = createMainDispatcher(handlers, { logger: options.logger })
  registerBridgeHandlers(ipcMainLike, dispatch, { allowReRegister: true })
}
