import {
  createFileSystemAdapter,
  type FileSystemAdapter
} from '../../host/adapters/file-system.adapter'
import { createShellAdapter, type ShellAdapter } from '../../host/adapters/electron-shell.adapter'
import { createExternalLinkService } from '../../host/services/external-link.service'
import { createFileService } from '../../host/services/file.service'
import { createConnectionService } from '../../host/services/connection.service'
import { createDeviceDiscoveryService } from '../../host/services/device-discovery.service'
import { createPluginCatalogService } from '../../host/services/plugin-catalog.service'
import { createPluginRuntimeService } from '../../host/services/plugin-runtime.service'
import { createRuntimeInfoService } from '../../host/services/runtime-info.service'
import { createPreferencesService } from '../../host/services/preferences.service'
import type { DeviceDiscoveryHostEvent } from '../../shared/protocol/types'
import type { BridgeLogger } from '../../shared/observability/logger'
import { homedir } from 'node:os'
import { join } from 'node:path'
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
  /** JSON KV store path for SynraPreferences bridge (defaults to ~/.synra/synra-preferences-store.json). */
  preferencesStorePath?: string
}

export type BridgeMainRuntime = {
  deviceDiscoveryService: ReturnType<typeof createDeviceDiscoveryService>
  connectionService: ReturnType<typeof createConnectionService>
}

export function setupBridgeMainRuntime(
  ipcMainLike: IpcMainLike,
  options: BridgeRuntimeOptions = {}
): BridgeMainRuntime {
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
  const preferencesStorePath =
    options.preferencesStorePath ?? join(homedir(), '.synra', 'synra-preferences-store.json')
  const preferencesService = createPreferencesService({ storePath: preferencesStorePath })

  const deviceDiscoveryService = createDeviceDiscoveryService({
    onHostEvent: options.onDiscoveryHostEvent,
    resolveLocalDeviceUuid: () => preferencesService.ensureDeviceInstanceUuid()
  })
  const connectionService = createConnectionService(deviceDiscoveryService)
  const pluginRuntimeService = createPluginRuntimeService()
  const pluginCatalogService = createPluginCatalogService(pluginRuntimeService)

  const handlers = createBridgeHandlers({
    runtimeInfoService,
    externalLinkService,
    fileService,
    pluginRuntimeService,
    pluginCatalogService,
    deviceDiscoveryService,
    connectionService,
    preferencesService
  })

  const dispatch = createMainDispatcher(handlers, { logger: options.logger })
  registerBridgeHandlers(ipcMainLike, dispatch, { allowReRegister: true })

  return {
    deviceDiscoveryService,
    connectionService
  }
}
