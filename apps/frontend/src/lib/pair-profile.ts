import { Capacitor } from '@capacitor/core'
import type { DiscoveredDevice } from '@synra/capacitor-lan-discovery'
import { ensureDeviceBasicInfo } from './device-basic-info'
import { ensureDeviceInstanceUuid } from './device-instance-uuid'
import { hashDeviceIdFromInstanceUuid } from './hash-device-id'
import type { PairInitiatorProfile } from './pair-protocol'

export async function buildLocalPairInitiatorProfile(
  selfOnLan?: Pick<DiscoveredDevice, 'ipAddress' | 'port' | 'source' | 'connectable'>
): Promise<PairInitiatorProfile> {
  const instanceUuid = await ensureDeviceInstanceUuid()
  const name = await ensureDeviceBasicInfo(instanceUuid)
  const deviceId = await hashDeviceIdFromInstanceUuid(instanceUuid)
  const platform = Capacitor.getPlatform()
  return {
    deviceId,
    name,
    ipAddress: selfOnLan?.ipAddress ?? '',
    port: selfOnLan?.port,
    source: selfOnLan?.source,
    connectable: selfOnLan?.connectable ?? true,
    platform
  }
}
