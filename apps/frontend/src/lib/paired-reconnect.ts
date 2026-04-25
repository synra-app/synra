/**
 * Delays (ms) before each automatic reconnect attempt after a paired device
 * drops out of the transport-ready set. Three attempts, then give up until manual Connect.
 */
export const PAIRED_RECONNECT_DELAYS_MS = [3000, 5000, 10_000] as const
export const PAIRED_RECONNECT_MAX_FAILURES = PAIRED_RECONNECT_DELAYS_MS.length
