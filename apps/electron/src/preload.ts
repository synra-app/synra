import { contextBridge, ipcRenderer } from "electron";
import {
  BRIDGE_HOST_EVENT_CHANNEL,
  createPreloadInvoker,
  type DeviceDiscoveryHostEvent,
  type IpcInvoke,
} from "@synra/capacitor-electron";

const ipcInvoke: IpcInvoke = async (channel, request) => ipcRenderer.invoke(channel, request);
const invoke = createPreloadInvoker(ipcInvoke);
const hostListeners = new Set<(event: DeviceDiscoveryHostEvent) => void>();

ipcRenderer.on(BRIDGE_HOST_EVENT_CHANNEL, (_event, payload: DeviceDiscoveryHostEvent) => {
  for (const listener of hostListeners) {
    listener(payload);
  }
});

console.log("[electron-preload] exposing __synraCapElectron");
contextBridge.exposeInMainWorld("__synraCapElectron", {
  invoke,
  onHostEvent(listener: (event: DeviceDiscoveryHostEvent) => void) {
    hostListeners.add(listener);
    return () => {
      hostListeners.delete(listener);
    };
  },
});
