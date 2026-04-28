import { contextBridge, ipcRenderer } from 'electron'
import {
  SYNRA_HOST_ENVELOPE_INVOKE_CHANNEL,
  SYNRA_HOST_ENVELOPE_PUSH_CHANNEL
} from '@synra/hooks/electron'
import {
  BRIDGE_HOST_EVENT_CHANNEL,
  createPreloadInvoker,
  type InvokeOptions,
  type IpcInvoke
} from './bridge/renderer'
import type {
  MethodPayloadMap,
  MethodResultMap,
  DeviceDiscoveryHostEvent
} from '@synra/capacitor-electron'

const ipcInvoke: IpcInvoke = async (channel, request) => ipcRenderer.invoke(channel, request)
const invoke = createPreloadInvoker(ipcInvoke)
const hostListeners = new Set<(event: DeviceDiscoveryHostEvent) => void>()
const hostEnvelopeListeners = new Set<(envelope: unknown) => void>()
const windowStateListeners = new Set<(state: { maximized: boolean; focused: boolean }) => void>()

const WINDOW_CONTROL_CHANNELS = {
  minimize: 'synra:window:minimize',
  toggleMaximize: 'synra:window:toggle-maximize',
  close: 'synra:window:close',
  isMaximized: 'synra:window:is-maximized',
  stateChange: 'synra:window:state-change'
} as const

ipcRenderer.on(BRIDGE_HOST_EVENT_CHANNEL, (_event, payload: DeviceDiscoveryHostEvent) => {
  for (const listener of hostListeners) {
    listener(payload)
  }
})

ipcRenderer.on(SYNRA_HOST_ENVELOPE_PUSH_CHANNEL, (_event, payload: unknown) => {
  for (const listener of hostEnvelopeListeners) {
    listener(payload)
  }
})

ipcRenderer.on(
  WINDOW_CONTROL_CHANNELS.stateChange,
  (_event, payload: { maximized: boolean; focused: boolean }) => {
    for (const listener of windowStateListeners) {
      listener(payload)
    }
  }
)

console.log('[electron-preload] exposing __synraCapElectron')
contextBridge.exposeInMainWorld('__synraCapElectron', {
  invoke: <TMethod extends keyof MethodPayloadMap>(
    method: TMethod,
    payload: MethodPayloadMap[TMethod],
    options?: InvokeOptions
  ) => invoke(method, payload, options) as Promise<MethodResultMap[TMethod]>,
  onHostEvent(listener: (event: DeviceDiscoveryHostEvent) => void) {
    hostListeners.add(listener)
    return () => {
      hostListeners.delete(listener)
    }
  }
})

contextBridge.exposeInMainWorld('__synraHostEnvelope', {
  subscribe(callback: (envelope: unknown) => void) {
    hostEnvelopeListeners.add(callback)
    return () => {
      hostEnvelopeListeners.delete(callback)
    }
  },
  postToMain(envelope: unknown) {
    return ipcRenderer.invoke(SYNRA_HOST_ENVELOPE_INVOKE_CHANNEL, envelope) as Promise<
      { ok: true } | { ok: false; error: string }
    >
  }
})

contextBridge.exposeInMainWorld('__synraWindowControls', {
  platform: process.platform,
  minimize: () => ipcRenderer.invoke(WINDOW_CONTROL_CHANNELS.minimize) as Promise<void>,
  toggleMaximize: () =>
    ipcRenderer.invoke(WINDOW_CONTROL_CHANNELS.toggleMaximize) as Promise<boolean>,
  close: () => ipcRenderer.invoke(WINDOW_CONTROL_CHANNELS.close) as Promise<void>,
  isMaximized: () => ipcRenderer.invoke(WINDOW_CONTROL_CHANNELS.isMaximized) as Promise<boolean>,
  onWindowStateChange(listener: (state: { maximized: boolean; focused: boolean }) => void) {
    windowStateListeners.add(listener)
    return () => {
      windowStateListeners.delete(listener)
    }
  }
})
