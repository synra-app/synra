import type { ConnectionRuntimeAdapter } from './adapter'

export type HooksRuntimeOptions = {
  adapterFactory?: () => ConnectionRuntimeAdapter
  /**
   * When set, devices with this LAN `deviceId` (hashed instance UUID) are never merged into the
   * discovery list — avoids listing this host as its own peer. IP is not used for this check.
   */
  localDiscoveryDeviceId?: string
  /**
   * When true, mobile LanDiscovery inbound TCP is migrated to DeviceConnection (legacy PC
   * reverse-connect). Default false so LAN sessions to Synra desktop/mobile peers stay on
   * LanDiscovery for pairing and custom messages.
   */
  enableMobileLanDeviceConnectionHandoff?: boolean
  /**
   * After TCP helloAck, `theirPairedPeerDeviceIds` lists device IDs the peer still considers paired
   * with (remote partners). If our hashed device id is missing while we still store `peerDeviceId`
   * as paired, the host should drop that stale pairing.
   */
  onHandshakePairedPeerIds?: (
    peerDeviceId: string,
    theirPairedPeerDeviceIds: string[],
    meta?: {
      sessionId?: string
      handshakeKind?: 'paired' | 'fresh'
      claimsPeerPaired?: boolean
    }
  ) => void
  /** After `custom.device.profileUpdated`: peer display name changed (optional paired-store patch). */
  onRemoteDeviceProfile?: (deviceId: string, displayName: string) => void
  /**
   * When true, LAN discovery updates for this `deviceId` are not merged into the
   * runtime discovery list (paired devices are shown from pairing storage + session upserts).
   */
  shouldExcludeDiscoveredDevice?: (deviceId: string) => boolean
}

let configuredOptions: HooksRuntimeOptions = {}

export function configureHooksRuntime(options: HooksRuntimeOptions): void {
  configuredOptions = { ...configuredOptions, ...options }
}

export function getHooksRuntimeOptions(): HooksRuntimeOptions {
  return configuredOptions
}

export function isLocalDiscoveryDeviceId(deviceId: string): boolean {
  const local = configuredOptions.localDiscoveryDeviceId
  return typeof local === 'string' && local.length > 0 && deviceId === local
}

export function resetHooksRuntimeOptions(): void {
  configuredOptions = {}
}
