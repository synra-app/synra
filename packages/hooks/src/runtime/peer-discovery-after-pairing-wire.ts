import type { DiscoveredDevice } from '@synra/capacitor-lan-discovery'
import {
  DEVICE_PAIRING_PEER_RESET_EVENT,
  DEVICE_PAIRING_UNPAIR_REQUIRED_EVENT
} from '@synra/protocol'
import type { Ref } from 'vue'
import { upsertDiscoveredPeerFromTransportOpened } from './discovered-device-upsert'
import type { OpenTransportLinksBook } from './open-transport-links-book'
import { DEFAULT_SYNRA_TCP_PORT } from './constants'

export function pairingWireEventNeedsDiscoveryResync(eventName: string): boolean {
  return (
    eventName === DEVICE_PAIRING_UNPAIR_REQUIRED_EVENT ||
    eventName === DEVICE_PAIRING_PEER_RESET_EVENT
  )
}

/**
 * After `dispatchSynraWireEvent` runs local pairing handlers, re-upsert the peer into the
 * runtime discovery list when the inbound TCP link is still ready (paired peers were removed
 * from `devices` on `transport.opened` when `shouldExcludeDiscoveredDevice` matched).
 */
export function scheduleReUpsertDiscoveredPeerAfterDispatch(
  dispatchPromise: Promise<void>,
  options: {
    peerId: string
    openLinksBook: OpenTransportLinksBook
    devices: Ref<DiscoveredDevice[]>
  }
): void {
  void dispatchPromise.finally(() => {
    const trimmed = options.peerId.trim()
    if (!trimmed) {
      return
    }
    const link = options.openLinksBook.getReadyLinkSnapshot(trimmed)
    if (!link) {
      return
    }
    const host = typeof link.host === 'string' ? link.host.trim() : ''
    if (!host) {
      return
    }
    const port = typeof link.port === 'number' && link.port > 0 ? link.port : DEFAULT_SYNRA_TCP_PORT
    upsertDiscoveredPeerFromTransportOpened(options.devices, {
      deviceId: trimmed,
      host,
      port
    })
  })
}
