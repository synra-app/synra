import { describe, expect, test } from "vite-plus/test";
import {
  hasElectronBridge,
  installElectronCapacitor,
  type CapacitorContract,
  type CapacitorWindow,
} from "../../src/capacitor";

describe("capacitor/index", () => {
  test("does not install electron platform without bridge", () => {
    const target = { Capacitor: {} } as CapacitorWindow;
    const patched = installElectronCapacitor({ target });

    expect(patched.getPlatform).toBeUndefined();
    expect(patched.isNativePlatform).toBeUndefined();
  });

  test("installs electron platform when bridge exists", () => {
    const target = {
      Capacitor: {},
      __synraCapElectron: {
        invoke: async () => ({ ok: true }),
      },
    } as CapacitorWindow;
    const patched = installElectronCapacitor({ target });

    expect(patched.getPlatform?.()).toBe("electron");
    expect(patched.isNativePlatform?.()).toBe(true);
    expect(target.Capacitor).toBe(patched);
  });

  test("keeps convertFileSrc fallback when present", () => {
    const target = {
      Capacitor: {
        convertFileSrc: (filePath: string) => `converted:${filePath}`,
      } satisfies CapacitorContract,
      __synraCapElectron: {
        invoke: async () => ({ ok: true }),
      },
    } as CapacitorWindow;
    const patched = installElectronCapacitor({ target });

    expect(patched.convertFileSrc?.("file://abc")).toBe("converted:file://abc");
  });

  test("reports bridge availability by invoke function", () => {
    const noBridge = {} as CapacitorWindow;
    const withBridge = {
      __synraCapElectron: {
        invoke: async () => ({ ok: true }),
      },
    } as CapacitorWindow;

    expect(hasElectronBridge(noBridge)).toBe(false);
    expect(hasElectronBridge(withBridge)).toBe(true);
  });
});
