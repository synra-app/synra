export type CapacitorContract = {
  getPlatform?: () => string;
  isNativePlatform?: () => boolean;
  isPluginAvailable?: (name: string) => boolean;
  convertFileSrc?: (filePath: string) => string;
};

export type CapacitorWindow = {
  Capacitor?: CapacitorContract;
  __synraCapElectron?: {
    invoke?: (...args: unknown[]) => Promise<unknown>;
  };
};

type InstallElectronCapacitorOptions = {
  target?: CapacitorWindow;
  capacitor?: CapacitorContract;
  force?: boolean;
};

const ELECTRON_PLATFORM = "electron";

function resolveDefaultTarget(): CapacitorWindow {
  const root = globalThis as typeof globalThis & {
    window?: CapacitorWindow;
  } & CapacitorWindow;

  return typeof root.window === "object" && root.window ? root.window : root;
}

export function hasElectronBridge(target: CapacitorWindow = resolveDefaultTarget()): boolean {
  return typeof target.__synraCapElectron?.invoke === "function";
}

export function installElectronCapacitor(
  options: InstallElectronCapacitorOptions = {},
): CapacitorContract {
  const target = options.target ?? resolveDefaultTarget();
  const capacitor = options.capacitor ?? target.Capacitor ?? {};
  const shouldInstall = options.force ?? hasElectronBridge(target);

  if (!shouldInstall) {
    return capacitor;
  }

  const fallbackConvertFileSrc = capacitor.convertFileSrc;
  const fallbackIsPluginAvailable = capacitor.isPluginAvailable;

  capacitor.getPlatform = () => ELECTRON_PLATFORM;
  capacitor.isNativePlatform = () => true;
  capacitor.convertFileSrc = (filePath: string) => {
    return fallbackConvertFileSrc ? fallbackConvertFileSrc(filePath) : filePath;
  };
  capacitor.isPluginAvailable = (name: string) => {
    if (name === "Capacitor" || name === "Electron") {
      return true;
    }

    return fallbackIsPluginAvailable ? fallbackIsPluginAvailable(name) : false;
  };

  target.Capacitor = capacitor;
  return capacitor;
}
