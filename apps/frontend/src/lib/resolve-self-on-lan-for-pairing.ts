import { createElectronBridgePluginFromGlobal } from '@synra/capacitor-electron/api/plugin'
import { hasElectronBridge } from '@synra/capacitor-electron/capacitor'
import type { DiscoveredDevice } from '@synra/capacitor-lan-discovery'

const DEFAULT_SYNRA_TCP_PORT = 32100

function isIpv4(value: string): boolean {
  const segments = value.trim().split('.')
  if (segments.length !== 4) {
    return false
  }
  return segments.every(
    (segment) => /^\d{1,3}$/.test(segment) && Number(segment) >= 0 && Number(segment) <= 255
  )
}

/**
 * Best-effort local LAN address for pair-request initiator profile (Electron: bridge runtime).
 */
export async function resolveSelfOnLanForPairing(): Promise<
  Pick<DiscoveredDevice, 'ipAddress' | 'port' | 'source' | 'connectable'> | undefined
> {
  if (!hasElectronBridge()) {
    return undefined
  }
  try {
    const bridge = createElectronBridgePluginFromGlobal()
    const info = await bridge.getRuntimeInfo()
    const ip = info.primaryDiscoveryIpv4?.trim() ?? ''
    if (!isIpv4(ip)) {
      return undefined
    }
    return {
      ipAddress: ip,
      port: DEFAULT_SYNRA_TCP_PORT,
      source: 'manual',
      connectable: true
    }
  } catch {
    return undefined
  }
}
