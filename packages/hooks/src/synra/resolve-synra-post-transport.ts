import { isLanWireEventName } from '@synra/protocol'
import { isHostOnlySynraEvent, stripForTransportRouting } from './synra-event-prefix'

export type SynraPostRoute = 'lan' | 'connection' | 'host'

/**
 * `lan`: device TCP wire (LAN frame); `connection`: app-level Synra message on connection;
 * `host`: main↔renderer (Electron) only, no TCP.
 * Strips `useSynraEvent` / `useSynraPluginEvent` wire prefixes before `isLanWireEventName` (see `stripForTransportRouting`).
 * SYNRA-COMM::MESSAGE_ENVELOPE::SEND::SYNRA_EVENT_POST_ROUTE
 */
export function resolveSynraPostTransport(wire: string): SynraPostRoute {
  if (isHostOnlySynraEvent(wire)) {
    return 'host'
  }
  const forLanCheck = stripForTransportRouting(wire)
  if (isLanWireEventName(forLanCheck)) {
    return 'lan'
  }
  return 'connection'
}
