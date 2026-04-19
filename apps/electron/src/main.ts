import { join, resolve } from 'node:path'
import { styleText } from 'node:util'
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { BRIDGE_HOST_EVENT_CHANNEL, setupBridgeMainRuntime } from './bridge/main'
import type {
  DeviceDiscoveryHostEvent,
  DeviceDiscoveryProbeConnectableOptions,
  DeviceDiscoveryStartOptions,
  DeviceSessionOpenOptions,
  DeviceSessionSendMessageOptions
} from '@synra/capacitor-electron'

type MainHooksBridge = {
  startDiscovery: (options?: DeviceDiscoveryStartOptions) => Promise<unknown>
  stopDiscovery: () => Promise<unknown>
  getDiscoveredDevices: () => Promise<unknown>
  probeConnectable: (options?: DeviceDiscoveryProbeConnectableOptions) => Promise<unknown>
  openSession: (options: DeviceSessionOpenOptions) => Promise<unknown>
  closeSession: (sessionId?: string) => Promise<unknown>
  sendMessage: (options: DeviceSessionSendMessageOptions) => Promise<unknown>
  getSessionState: (sessionId?: string) => Promise<unknown>
  pullHostEvents: () => Promise<{ events: DeviceDiscoveryHostEvent[] }>
  onHostEvent: (listener: (event: DeviceDiscoveryHostEvent) => void) => () => void
}

type MainHooksGlobal = typeof globalThis & {
  __synraHooksMainBridge?: MainHooksBridge
}

const TAG_STYLES: Readonly<Record<string, Parameters<typeof styleText>[0]>> = {
  'electron-main': 'blue',
  'renderer:0': 'green',
  'renderer:1': 'yellow',
  'renderer:2': 'red',
  'renderer:3': 'magenta'
}

const WINDOW_CONTROL_CHANNELS = {
  minimize: 'synra:window:minimize',
  toggleMaximize: 'synra:window:toggle-maximize',
  close: 'synra:window:close',
  isMaximized: 'synra:window:is-maximized',
  stateChange: 'synra:window:state-change'
} as const

function styleTag(tag: string): string {
  const style = TAG_STYLES[tag] ?? 'cyan'
  return styleText(style, `[${tag}]`)
}

function logWithTag(tag: string, ...args: unknown[]): void {
  console.log(styleTag(tag), ...args)
}

function errorWithTag(tag: string, ...args: unknown[]): void {
  console.error(styleTag(tag), ...args)
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
    errorWithTag('electron-main', 'preload-error:', preloadPath, error)
  })

  mainWindow.webContents.on('did-finish-load', () => {
    void mainWindow.webContents
      .executeJavaScript('Boolean(window.__synraCapElectron && window.__synraCapElectron.invoke)')
      .then((available) => {
        logWithTag('electron-main', 'bridge available:', available)
        logWithTag(
          'electron-main',
          'renderer load completed in',
          `${Date.now() - startupBeginAt}ms`
        )
      })
      .catch((error) => {
        errorWithTag('electron-main', 'bridge probe failed:', error)
      })
  })

  mainWindow.once('ready-to-show', () => {
    logWithTag('electron-main', 'window ready-to-show in', `${Date.now() - startupBeginAt}ms`)
    if (!mainWindow.isDestroyed()) {
      mainWindow.show()
      emitWindowState(mainWindow)
    }
  })

  mainWindow.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL) => {
      errorWithTag(
        'electron-main',
        'did-fail-load:',
        `code=${String(errorCode)}`,
        errorDescription,
        validatedURL
      )
    }
  )

  mainWindow.webContents.on('console-message', (_event, level, message) => {
    logWithTag(`renderer:${String(level)}`, message)
  })

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
    allowedFileRoots: [app.getAppPath()],
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
    stopDiscovery: () => runtime.deviceDiscoveryService.stopDiscovery(),
    getDiscoveredDevices: () => runtime.deviceDiscoveryService.listDevices(),
    probeConnectable: (options) => runtime.deviceDiscoveryService.probeConnectable(options),
    openSession: (options) => runtime.connectionService.openSession(options),
    closeSession: (sessionId) => runtime.connectionService.closeSession({ sessionId }),
    sendMessage: (options) => runtime.connectionService.sendMessage(options),
    getSessionState: (sessionId) => runtime.connectionService.getSessionState({ sessionId }),
    pullHostEvents: () => runtime.connectionService.pullHostEvents(),
    onHostEvent(listener) {
      hostEventListeners.add(listener)
      return () => {
        hostEventListeners.delete(listener)
      }
    }
  }
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

void app.whenReady().then(() => {
  registerCapacitorElectronBridge()
  registerWindowControlBridge()
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
