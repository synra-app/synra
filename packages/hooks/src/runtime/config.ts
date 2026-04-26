import type { TransportOpenedEvent, SynraLanConnectType } from '@synra/capacitor-device-connection'
import type { ConnectionRuntimeAdapter } from './adapter'

export type HooksRuntimeOptions = {
  adapterFactory?: () => ConnectionRuntimeAdapter
  /**
   * When set, devices with this LAN `deviceId` (instance UUID) are never merged into the
   * discovery list — avoids listing this host as its own peer. IP is not used for this check.
   */
  localDiscoveryDeviceId?: string
  /** After `custom.device.profileUpdated`: peer display name changed (optional paired-store patch). */
  onRemoteDeviceProfile?: (deviceId: string, displayName: string) => void
  /**
   * When true, LAN discovery updates for this `deviceId` are not merged into the
   * runtime discovery list (paired devices are shown from pairing storage + transport upserts).
   */
  shouldExcludeDiscoveredDevice?: (deviceId: string) => boolean
  /**
   * Classifies outbound Synra `connect` for `deviceId` (`fresh` = opener has no local pairing for this peer).
   * When omitted, transport code defaults to `paired` for legacy compatibility.
   */
  resolveSynraConnectType?: (
    deviceId: string
  ) => SynraLanConnectType | undefined | Promise<SynraLanConnectType | undefined>
  /**
   * Inbound transport where the peer sent `connectType: fresh` but this host may still list them as paired.
   * Used to drop stale paired rows and surface the peer in discovery UI.
   */
  repairStalePairingAfterInboundFreshConnect?: (event: TransportOpenedEvent) => void | Promise<void>
  /**
   * Outbound transport where peer `connectAck` indicates this host is no longer paired on the peer side.
   * Used to downgrade local paired rows and keep both sides converged to fresh state.
   */
  repairStalePairingAfterOutboundUnpairedAck?: (event: TransportOpenedEvent) => void | Promise<void>
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
