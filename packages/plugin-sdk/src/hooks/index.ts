/**
 * Older plugin bundles may still import `useTransport` / `onSynraMessage` from this barrel. Host apps
 * own discovery; plugin UI should prefer `usePairedDevices` and `useSynraPluginEnvelope().subscribe`.
 * Re-export avoids broken resolves until plugins are rebuilt.
 */
export { type ConnectToDeviceOptions, useTransport } from '@synra/hooks'
export {
  bumpPairedDevicesStorageEpoch,
  deriveDeviceCardBadge,
  getPairAwaitingAcceptDeviceIds,
  getPairedLinkPhases,
  mergePairedAndDiscoveredDevices,
  onSynraMessage,
  pairedDevicesStorageEpoch,
  setPairAwaitingAccept,
  setPairedDeviceConnecting,
  usePairedDevices,
  useSynraPluginEnvelope,
  type DeviceCardBadge,
  type DisplayDevice,
  type PairedDeviceRow,
  type PairedLinkStatus,
  type ScanPhase,
  type SynraEnvelopeRuntimeSurface,
  type SynraInboundEnvelope,
  type SynraInboundFilter,
  type SynraMessageEnvelope,
  type UseSynraEnvelopeRequestOptions
} from '@synra/hooks'
