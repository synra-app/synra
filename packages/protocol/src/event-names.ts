/**
 * Cross-platform communication annotation taxonomy (search-only comments).
 *
 * Prefix:
 *   SYNRA-COMM::<Domain>::<Stage>::<NodeId>
 *
 * Domains:
 *   TCP | UDP_DISCOVERY | DEVICE_HANDSHAKE | PLUGIN_BRIDGE | MESSAGE_ENVELOPE
 *
 * Stages:
 *   CONNECT | SEND | RECEIVE | ACK | HEARTBEAT | CLOSE | ERROR
 *
 * Shared NodeId vocabulary:
 *   OPEN_TRANSPORT
 *   PROBE_SINGLE
 *   INBOUND_ACCEPT
 *   OUTBOUND_RECV_LOOP
 *   LAN_EVENT_ROUTE
 *   MESSAGE_SEND
 *   MESSAGE_RECV
 *   TRANSPORT_CLOSE
 *   TRANSPORT_HEARTBEAT
 *   TRANSPORT_ERROR
 *
 * Keep the same Domain/Stage/NodeId triplet across Node.js, Android, and iOS.
 */
export const DEVICE_TCP_CONNECT_EVENT = 'device.tcp.connect' as const
export const DEVICE_TCP_CONNECT_ACK_EVENT = 'device.tcp.connect.ack' as const
export const DEVICE_TCP_ACK_EVENT = 'device.tcp.ack' as const
export const DEVICE_TCP_CLOSE_EVENT = 'device.tcp.close' as const
export const DEVICE_TCP_ERROR_EVENT = 'device.tcp.error' as const
export const DEVICE_TCP_HEARTBEAT_EVENT = 'device.tcp.heartbeat' as const

export const DEVICE_HOST_RETIRE_EVENT = 'device.host.retire' as const
export const DEVICE_MEMBER_OFFLINE_EVENT = 'device.member.offline' as const

export const DEVICE_DISPLAY_NAME_CHANGED_EVENT = 'device.display-name.changed' as const
export const DEVICE_PAIRING_PREFIX = 'device.pairing.' as const
export const DEVICE_PAIRING_REQUEST_EVENT = 'device.pairing.request' as const
export const DEVICE_PAIRING_RESPONSE_EVENT = 'device.pairing.response' as const
export const DEVICE_PAIRING_PEER_RESET_EVENT = 'device.pairing.peer-reset' as const
export const DEVICE_PAIRING_UNPAIR_REQUIRED_EVENT = 'device.pairing.unpair-required' as const

export function isDevicePairingEvent(event: string): boolean {
  return event.startsWith(DEVICE_PAIRING_PREFIX)
}
