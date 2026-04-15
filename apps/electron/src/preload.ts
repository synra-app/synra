import { contextBridge, ipcRenderer } from "electron";
import { createPreloadInvoker, type IpcInvoke } from "@synra/capacitor-electron";

const ipcInvoke: IpcInvoke = async (channel, request) => ipcRenderer.invoke(channel, request);
const invoke = createPreloadInvoker(ipcInvoke);

console.log("[electron-preload] exposing __synraCapElectron");
contextBridge.exposeInMainWorld("__synraCapElectron", { invoke });
