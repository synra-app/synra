import { join, resolve } from "node:path";
import { styleText } from "node:util";
import { app, BrowserWindow, ipcMain, shell } from "electron";
import { setupBridgeMainRuntime } from "@synra/capacitor-electron";

const TAG_STYLES: Readonly<Record<string, Parameters<typeof styleText>[0]>> = {
  "electron-main": "blue",
  "renderer:0": "green",
  "renderer:1": "yellow",
  "renderer:2": "red",
  "renderer:3": "magenta",
};

function styleTag(tag: string): string {
  const style = TAG_STYLES[tag] ?? "cyan";
  return styleText(style, `[${tag}]`);
}

function logWithTag(tag: string, ...args: unknown[]): void {
  console.log(styleTag(tag), ...args);
}

function errorWithTag(tag: string, ...args: unknown[]): void {
  console.error(styleTag(tag), ...args);
}

function createMainWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: join(resolve(__dirname), "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl);
  } else {
    void mainWindow.loadFile(join(process.cwd(), "www", "index.html"));
  }

  mainWindow.webContents.on("preload-error", (_event, preloadPath, error) => {
    errorWithTag("electron-main", "preload-error:", preloadPath, error);
  });

  mainWindow.webContents.on("did-finish-load", () => {
    void mainWindow.webContents
      .executeJavaScript("Boolean(window.__synraCapElectron && window.__synraCapElectron.invoke)")
      .then((available) => {
        logWithTag("electron-main", "bridge available:", available);
      })
      .catch((error) => {
        errorWithTag("electron-main", "bridge probe failed:", error);
      });
  });

  mainWindow.webContents.on("console-message", (_event, level, message) => {
    logWithTag(`renderer:${String(level)}`, message);
  });

  return mainWindow;
}

function registerCapacitorElectronBridge(): void {
  setupBridgeMainRuntime(ipcMain, {
    shellAdapter: {
      async openExternal(url: string): Promise<void> {
        await shell.openExternal(url);
      },
    },
    allowedFileRoots: [process.cwd()],
    capacitorVersion: "8.x",
    electronVersion: process.versions.electron,
  });
}

void app.whenReady().then(() => {
  registerCapacitorElectronBridge();
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
