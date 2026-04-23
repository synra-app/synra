export { useTransport, type ConnectToDeviceOptions } from './hooks/use-transport'
export {
  DEVICE_PROFILE_UPDATED_MESSAGE_TYPE,
  type DeviceProfileUpdatedPayload
} from './runtime/device-profile'
export { usePairedDevices } from './hooks/use-paired-devices'
export {
  configureHooksRuntime,
  getHooksRuntimeOptions,
  isLocalDiscoveryDeviceId,
  resetHooksRuntimeOptions
} from './runtime/config'
export { getConnectionRuntime, resetConnectionRuntime } from './runtime/core'
export {
  deriveDeviceCardBadge,
  type DeviceCardBadge,
  type ScanPhase
} from './runtime/derive-device-card-badge'
export type {
  AppLinkState,
  SynraConnectionFilter,
  SynraConnectionMessage,
  SynraConnectionSendInput,
  RuntimeConnectedSession,
  TransportLinkState
} from './types'
export type { ConnectionRuntime } from './runtime/core'
export type { PairedDeviceRow, PairedLinkStatus } from './hooks/use-paired-devices'
export {
  mergePairedAndDiscoveredDevices,
  type DisplayDevice
} from './runtime/display-devices-merge'
export { getPairedLinkPhases, setPairedDeviceConnecting } from './runtime/paired-link-phases'
export {
  bumpPairedDevicesStorageEpoch,
  pairedDevicesStorageEpoch
} from './runtime/paired-devices-storage-epoch'
export {
  getPairAwaitingAcceptDeviceIds,
  setPairAwaitingAccept
} from './runtime/pair-awaiting-accept'
