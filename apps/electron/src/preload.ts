import { contextBridge, ipcRenderer } from 'electron'
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

ipcRenderer.on(BRIDGE_HOST_EVENT_CHANNEL, (_event, payload: DeviceDiscoveryHostEvent) => {
  for (const listener of hostListeners) {
    listener(payload)
  }
})

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
