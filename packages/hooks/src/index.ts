export { useTransport, type ConnectToDeviceOptions } from './hooks/use-transport'
export {
  USE_SYNRA_ENVELOPE_DEFAULT_TIMEOUT_MS,
  useSynraEnvelope,
  useSynraSystemEnvelope,
  useSynraPluginEnvelope,
  type SynraEnvelopeRuntimeSurface,
  type SynraInboundEnvelope,
  type SynraInboundFilter,
  type SynraMessageEnvelope,
  type UseSynraEnvelopeRequestOptions
} from './envelope'
export type { SynraConnectionSendInput, SynraLanWireSendInput } from '@synra/envelope'
export { getSynraEnvelopeRuntimeSurface } from '@synra/envelope'
export { parseSynraMessageEnvelope, isWhitelistedEnvelopeRecord } from '@synra/envelope'
export {
  SYNRA_HOST_ENVELOPE_PUSH_CHANNEL,
  SYNRA_HOST_ENVELOPE_INVOKE_CHANNEL
} from './synra/host-ipc-constants'
export { setSynraHostEnvelopeMainDispatch } from './synra/host-envelope-main-dispatch'
export {
  toLogicalFromSystemWireEvent,
  toSystemWireEvent,
  toPluginWireEvent,
  toLogicalFromPluginWireEvent,
  normalizePluginPackageNameToWireSlug,
  SYSTEM_WIRE_EVENT_PREFIX,
  SYNRA_HOST_ONLY_EVENT_PREFIX
} from '@synra/envelope'
export { useLogger } from './hooks/use-logger'
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
  RuntimeOpenTransportLink,
  RuntimePrimaryTransportState,
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
  fileTransferChunkCount,
  iteratePluginBundleChunks,
  PluginBundleTransferAssembly,
  useFileTransfer,
  type PluginBundleTransferProgressSnapshot,
  type FileTransferAbortPayload,
  type FileTransferChunkPayload,
  type FileTransferCompletePayload,
  type FileTransferKind,
  type FileTransferProgressPayload,
  type FileTransferRequestPayload
} from './file-transfer/index'
export {
  getPairAwaitingAcceptDeviceIds,
  setPairAwaitingAccept
} from './runtime/pair-awaiting-accept'
