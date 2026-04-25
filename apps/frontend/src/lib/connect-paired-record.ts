import type { SynraPairedDeviceRecord } from '@synra/capacitor-preferences'
import { setPairedDeviceConnecting } from '@synra/hooks'
import type { DiscoveredDevice } from '@synra/capacitor-lan-discovery'
import { isIpv4Address } from './network'

export type ConnectPairedDeps = {
  isTransportReady: (deviceId: string) => boolean
  peers: () => readonly DiscoveredDevice[]
  connectToDevice: (
    deviceId: string,
    options?: { suppressGlobalError?: boolean }
  ) => Promise<string | undefined>
  connectToDeviceAt: (
    deviceId: string,
    host: string,
    port: number,
    options?: { suppressGlobalError?: boolean }
  ) => Promise<string | undefined>
}

/**
 * Best-effort transport open for a paired device (peer from scan or stored IPv4 host).
 * Returns whether the device is transport-ready after the attempt.
 */
export async function tryOpenTransportForPairedRecord(
  deps: ConnectPairedDeps,
  record: SynraPairedDeviceRecord
): Promise<boolean> {
  const { deviceId } = record
  if (deps.isTransportReady(deviceId)) {
    return true
  }
  const peer = deps
    .peers()
    .find((item) => item.deviceId === deviceId && item.connectable && isIpv4Address(item.ipAddress))
  const host = record.lastResolvedHost?.trim()
  const canDialStoredHost = isIpv4Address(host)
  if (!peer && !canDialStoredHost) {
    return false
  }
  setPairedDeviceConnecting(deviceId, true)
  try {
    if (peer) {
      await deps.connectToDevice(deviceId, { suppressGlobalError: true })
    } else if (canDialStoredHost && host) {
      await deps.connectToDeviceAt(deviceId, host, record.lastResolvedPort ?? 32_100, {
        suppressGlobalError: true
      })
    }
  } catch {
    // best-effort
  } finally {
    setPairedDeviceConnecting(deviceId, false)
  }
  return deps.isTransportReady(deviceId)
}
