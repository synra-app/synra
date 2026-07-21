import {
  createFileSystemAdapter,
  type FileSystemAdapter
} from '../../host/adapters/file-system.adapter'
import { createShellAdapter, type ShellAdapter } from '../../host/adapters/electron-shell.adapter'
import { type ClipboardAdapter } from '../../host/adapters/electron-clipboard.adapter'
import { createExternalLinkService } from '../../host/services/external-link.service'
import { createClipboardService } from '../../host/services/clipboard.service'
import { createFileService } from '../../host/services/file.service'
import { createConnectionService } from '../../host/services/connection.service'
import { createDeviceDiscoveryService } from '../../host/services/device-discovery.service'
import { createPluginCatalogService } from '../../host/services/plugin-catalog.service'
import { createPluginManagementService } from '../../host/services/plugin-management.service'
import { createPluginRuntimeService } from '../../host/services/plugin-runtime.service'
import { createRuntimeInfoService } from '../../host/services/runtime-info.service'
import { createPreferencesService } from '../../host/services/preferences.service'
import type { DeviceDiscoveryHostEvent } from '../../shared/protocol/types'
import type { BridgeLogger } from '../../shared/observability/logger'
import { homedir } from 'node:os'
import { join } from 'pathe'
import { createMainDispatcher } from './dispatch'
import { createBridgeHandlers } from './handlers'
import { registerBridgeHandlers, type IpcMainLike } from './register'

export type BridgeRuntimeOptions = {
  shellAdapter?: ShellAdapter
  /**
   * Required: the host must wire a real clipboard adapter (typically
   * `{ readText, readSelection, writeText }` backed by Electron's
   * `clipboard` module plus `os-selection.ts`). Defaults are
   * intentionally not provided — see `electron-clipboard.adapter.ts`
   * for why.
   */
  clipboardAdapter: ClipboardAdapter
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
  options: BridgeRuntimeOptions
): BridgeMainRuntime {
  if (!options.clipboardAdapter) {
    throw new Error(
      '[synra:bridge] setupBridgeMainRuntime requires options.clipboardAdapter. ' +
        "The host must wire a ClipboardAdapter backed by Electron's clipboard module + " +
        'os-selection.ts so clipboard.read / clipboard.readSelection / clipboard.write resolve.'
    )
  }
  const shellAdapter = options.shellAdapter ?? createShellAdapter()
  const clipboardAdapter = options.clipboardAdapter
  const fileSystemAdapter = options.fileSystemAdapter ?? createFileSystemAdapter()

  const runtimeInfoService = createRuntimeInfoService({
    capacitorVersion: options.capacitorVersion,
    electronVersion: options.electronVersion
  })
  const externalLinkService = createExternalLinkService(shellAdapter)
  const clipboardService = createClipboardService(clipboardAdapter)
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
  const pluginManagementService = createPluginManagementService()

  const handlers = createBridgeHandlers({
    runtimeInfoService,
    externalLinkService,
    clipboardService,
    fileService,
    pluginRuntimeService,
    pluginCatalogService,
    pluginManagementService,
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
