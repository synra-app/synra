import { extname } from 'node:path'
import { homedir } from 'node:os'
import { existsSync, readFileSync } from 'node:fs'
import { join, normalize, resolve } from 'pathe'
import { app, BrowserWindow, clipboard, ipcMain, protocol, shell } from 'electron'
import {
  parseSynraMessageEnvelope,
  setSynraHostEnvelopeMainDispatch,
  SYNRA_HOST_ENVELOPE_INVOKE_CHANNEL,
  SYNRA_HOST_ENVELOPE_PUSH_CHANNEL,
  type SynraMessageEnvelope
} from '@synra/hooks/electron'
import { captureOsTextSelection } from './os-selection'
import { BRIDGE_HOST_EVENT_CHANNEL, setupBridgeMainRuntime } from './bridge/main'
import type {
  DeviceDiscoveryHostEvent,
  DeviceDiscoveryStartOptions,
  DeviceTransportOpenOptions,
  DeviceTransportSendLanEventOptions,
  DeviceTransportSendMessageOptions
} from '@synra/capacitor-electron'
import { createLogger } from '@synra/utils'

type MainHooksBridge = {
  startDiscovery: (options?: DeviceDiscoveryStartOptions) => Promise<unknown>
  listDiscoveredDevices: () => Promise<unknown>
  openTransport: (options: DeviceTransportOpenOptions) => Promise<unknown>
  closeTransport: (targetDeviceId?: string) => Promise<unknown>
  sendMessage: (options: DeviceTransportSendMessageOptions) => Promise<unknown>
  sendLanEvent: (options: DeviceTransportSendLanEventOptions) => Promise<unknown>
  getTransportState: (targetDeviceId?: string) => Promise<unknown>
  onHostEvent: (listener: (event: DeviceDiscoveryHostEvent) => void) => () => void
}

type MainHooksGlobal = typeof globalThis & {
  __synraHooksMainBridge?: MainHooksBridge
}

const mainLogger = createLogger('electron-main')
const PLUGIN_ASSET_SCHEME = 'synra-plugin'
const PLUGIN_ROOT_DIR = join(homedir(), '.synra', 'plugins')
const PLUGIN_INSTALL_STORE_PATH = join(homedir(), '.synra', 'plugins', 'installed.json')
const PLUGIN_MIME_BY_EXT: Record<string, string> = {
  '.mjs': 'application/javascript; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8'
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: PLUGIN_ASSET_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true
    }
  }
])

const WINDOW_CONTROL_CHANNELS = {
  minimize: 'synra:window:minimize',
  toggleMaximize: 'synra:window:toggle-maximize',
  close: 'synra:window:close',
  isMaximized: 'synra:window:is-maximized',
  stateChange: 'synra:window:state-change'
} as const

let stopDiscoveryOnQuit: (() => Promise<unknown>) | undefined
let isQuittingAfterCleanup = false

type InstalledPluginStoreDoc = {
  installed?: Array<{ pluginId?: string; artifactRoot?: string }>
}

function resolveInstalledArtifactRoot(pluginId: string): string | null {
  if (!existsSync(PLUGIN_INSTALL_STORE_PATH)) {
    return null
  }
  try {
    const parsed = JSON.parse(
      readFileSync(PLUGIN_INSTALL_STORE_PATH, 'utf-8')
    ) as InstalledPluginStoreDoc
    const records = Array.isArray(parsed.installed) ? parsed.installed : []
    const matched = records.find((item) => item.pluginId === pluginId)
    if (!matched?.artifactRoot || typeof matched.artifactRoot !== 'string') {
      return null
    }
    return normalize(matched.artifactRoot.replace(/\\/g, '/'))
  } catch {
    return null
  }
}

function toPluginAssetFilePath(requestUrl: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(requestUrl)
  } catch {
    return null
  }
  const pluginId = decodeURIComponent(parsed.hostname || '').trim()
  if (!pluginId) {
    return null
  }
  const artifactRoot = resolveInstalledArtifactRoot(pluginId)
  if (!artifactRoot) {
    return null
  }
  const relativePath = decodeURIComponent(parsed.pathname || '').replace(/^\/+/, '')
  if (!relativePath) {
    return null
  }
  const packageRoot = resolve(artifactRoot, 'package')
  const resolvedFilePath = resolve(packageRoot, relativePath)
  const normalizedPackageRoot = normalize(packageRoot).toLowerCase()
  const normalizedResolvedPath = normalize(resolvedFilePath).toLowerCase()
  if (
    normalizedResolvedPath !== normalizedPackageRoot &&
    !normalizedResolvedPath.startsWith(`${normalizedPackageRoot}/`)
  ) {
    return null
  }
  const ext = extname(resolvedFilePath).toLowerCase()
  if (!PLUGIN_MIME_BY_EXT[ext]) {
    return null
  }
  if (!existsSync(resolvedFilePath)) {
    return null
  }
  return resolvedFilePath
}

function registerPluginAssetProtocol(): void {
  protocol.handle(PLUGIN_ASSET_SCHEME, (request) => {
    const filePath = toPluginAssetFilePath(request.url)
    if (!filePath) {
      return new Response('Not Found', { status: 404 })
    }
    const ext = extname(filePath).toLowerCase()
    const contentType = PLUGIN_MIME_BY_EXT[ext] ?? 'application/octet-stream'
    const body = readFileSync(filePath)
    return new Response(body, {
      status: 200,
      headers: {
        'content-type': contentType,
        'cache-control': 'no-cache'
      }
    })
  })
}

function buildWindowState(window: BrowserWindow): { maximized: boolean; focused: boolean } {
  return {
    maximized: window.isMaximized(),
    focused: window.isFocused()
  }
}

function emitWindowState(window: BrowserWindow): void {
  if (window.isDestroyed()) {
    return
  }
  window.webContents.send(WINDOW_CONTROL_CHANNELS.stateChange, buildWindowState(window))
}

function registerWindowStateListeners(window: BrowserWindow): void {
  window.on('maximize', () => emitWindowState(window))
  window.on('unmaximize', () => emitWindowState(window))
  window.on('focus', () => emitWindowState(window))
  window.on('blur', () => emitWindowState(window))
}

function createMainWindow(): BrowserWindow {
  const startupBeginAt = Date.now()
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    frame: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : undefined,
    trafficLightPosition: process.platform === 'darwin' ? { x: 16, y: 16 } : undefined,
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: join(resolve(__dirname), 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  const devServerUrl = process.env.VITE_DEV_SERVER_URL
  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl)
  } else {
    void mainWindow.loadFile(join(app.getAppPath(), 'www', 'index.html'))
  }

  mainWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
    mainLogger.error('preload-error:', preloadPath, error)
  })

  mainWindow.webContents.on('did-finish-load', () => {
    void mainWindow.webContents
      .executeJavaScript('Boolean(window.__synraCapElectron && window.__synraCapElectron.invoke)')
      .then((available) => {
        mainLogger.info('bridge available:', available)
        mainLogger.info('renderer load completed in', `${Date.now() - startupBeginAt}ms`)
      })
      .catch((error) => {
        mainLogger.error('bridge probe failed:', error)
      })
  })

  mainWindow.once('ready-to-show', () => {
    mainLogger.success('window ready-to-show in', `${Date.now() - startupBeginAt}ms`)
    if (!mainWindow.isDestroyed()) {
      mainWindow.show()
      emitWindowState(mainWindow)
    }
  })

  mainWindow.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL) => {
      mainLogger.error(
        'did-fail-load:',
        `code=${String(errorCode)}`,
        errorDescription,
        validatedURL
      )
    }
  )

  registerWindowStateListeners(mainWindow)

  return mainWindow
}

function registerCapacitorElectronBridge(): void {
  const hostEventListeners = new Set<(event: DeviceDiscoveryHostEvent) => void>()
  const runtime = setupBridgeMainRuntime(ipcMain, {
    shellAdapter: {
      async openExternal(url: string): Promise<void> {
        await shell.openExternal(url)
      }
    },
    clipboardAdapter: {
      // Synchronous on Electron's `clipboard` module; wrap in a Promise
      // so the bridge shape stays consistent. Backs the
      // `_plugin.<slug>.copy-selection` host handler — the phone sends
      // "send me whatever is in your OS clipboard", the Electron
      // host reads it here and replies with the text. Also backs
      // `clipboard.write` so a plugin on this Electron host can mirror
      // text into the OS clipboard via the bridge.
      async readText(): Promise<string> {
        return clipboard.readText()
      },
      // Captures the host's current text selection (not clipboard).
      // Triggers the platform's native copy shortcut (Ctrl+C / Cmd+C /
      // xdotool ctrl+c) via `os-selection.ts`, reads the resulting
      // clipboard, then restores the original clipboard content. See
      // that module for the per-platform implementation details.
      async readSelection(): Promise<string> {
        return captureOsTextSelection({
          platform: process.platform,
          readClipboard: () => clipboard.readText(),
          writeClipboard: (text) => {
            clipboard.writeText(text)
          }
        })
      },
      async writeText(text: string): Promise<void> {
        clipboard.writeText(text)
      }
    },
    allowedFileRoots: [app.getAppPath(), PLUGIN_ROOT_DIR],
    preferencesStorePath: join(app.getPath('userData'), 'synra-preferences-store.json'),
    capacitorVersion: '8.x',
    electronVersion: process.versions.electron,
    onDiscoveryHostEvent(event) {
      for (const listener of hostEventListeners) {
        listener(event)
      }
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) {
          window.webContents.send(BRIDGE_HOST_EVENT_CHANNEL, event)
        }
      }
    }
  })

  const bridgeTarget = globalThis as MainHooksGlobal
  bridgeTarget.__synraHooksMainBridge = {
    startDiscovery: (options) => runtime.deviceDiscoveryService.startDiscovery(options),
    listDiscoveredDevices: () => runtime.deviceDiscoveryService.listDevices(),
    openTransport: (options) => runtime.connectionService.openTransport(options),
    closeTransport: (targetDeviceId) =>
      runtime.connectionService.closeTransport({ target: targetDeviceId }),
    sendMessage: (options) => runtime.connectionService.sendMessage(options),
    sendLanEvent: (options) => runtime.connectionService.sendLanEvent(options),
    getTransportState: (targetDeviceId) =>
      runtime.connectionService.getTransportState({ target: targetDeviceId }),
    onHostEvent(listener) {
      hostEventListeners.add(listener)
      return () => {
        hostEventListeners.delete(listener)
      }
    }
  }
  stopDiscoveryOnQuit = () => runtime.deviceDiscoveryService.stopDiscovery()
}

function registerWindowControlBridge(): void {
  ipcMain.handle(WINDOW_CONTROL_CHANNELS.minimize, (event) => {
    const targetWindow = BrowserWindow.fromWebContents(event.sender)
    targetWindow?.minimize()
  })

  ipcMain.handle(WINDOW_CONTROL_CHANNELS.toggleMaximize, (event) => {
    const targetWindow = BrowserWindow.fromWebContents(event.sender)
    if (!targetWindow) {
      return false
    }
    if (targetWindow.isMaximized()) {
      targetWindow.unmaximize()
      return false
    }
    targetWindow.maximize()
    return true
  })

  ipcMain.handle(WINDOW_CONTROL_CHANNELS.close, (event) => {
    const targetWindow = BrowserWindow.fromWebContents(event.sender)
    targetWindow?.close()
  })

  ipcMain.handle(WINDOW_CONTROL_CHANNELS.isMaximized, (event) => {
    const targetWindow = BrowserWindow.fromWebContents(event.sender)
    return Boolean(targetWindow?.isMaximized())
  })
}

/**
 * Scheme B: whitelisted host↔renderer envelope over dedicated IPC
 * (see `useSynraEnvelope` + preload `__synraHostEnvelope`).
 * SYNRA-COMM::MESSAGE_ENVELOPE::SEND::ELECTRON_HOST_ENVELOPE_IPC
 */
function registerSynraHostEnvelopeBridge(): void {
  function broadcastToRenderers(envelope: SynraMessageEnvelope): void {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send(SYNRA_HOST_ENVELOPE_PUSH_CHANNEL, envelope)
      }
    }
  }

  setSynraHostEnvelopeMainDispatch(broadcastToRenderers)

  ipcMain.handle(SYNRA_HOST_ENVELOPE_INVOKE_CHANNEL, (_event, payload: unknown) => {
    const parsed = parseSynraMessageEnvelope(payload)
    if (!parsed) {
      return { ok: false as const, error: 'invalid envelope' }
    }
    broadcastToRenderers(parsed)
    return { ok: true as const }
  })
}

void app.whenReady().then(() => {
  registerPluginAssetProtocol()
  registerCapacitorElectronBridge()
  registerWindowControlBridge()
  registerSynraHostEnvelopeBridge()
  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', (event) => {
  if (isQuittingAfterCleanup) {
    return
  }
  event.preventDefault()
  void Promise.resolve()
    .then(async () => {
      await stopDiscoveryOnQuit?.().catch(() => undefined)
    })
    .finally(() => {
      isQuittingAfterCleanup = true
      app.quit()
    })
})
