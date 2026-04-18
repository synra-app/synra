import { describe, expect, test } from "vite-plus/test";
import { LanDiscoveryWeb } from "../src/web";

describe("capacitor-lan-discovery/web", () => {
  test("starts and stops discovery state", async () => {
    const plugin = new LanDiscoveryWeb();
    const started = await plugin.startDiscovery({
      scanWindowMs: 5000,
      includeLoopback: true,
    });
    expect(started.state).toBe("scanning");

    const listed = await plugin.getDiscoveredDevices();
    expect(listed.state).toBe("scanning");
    expect(listed.scanWindowMs).toBe(5000);

    const stopped = await plugin.stopDiscovery();
    expect(stopped.success).toBe(true);
  });
});
