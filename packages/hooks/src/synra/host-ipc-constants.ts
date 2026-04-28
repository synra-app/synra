/**
 * IPC channel names for Electron scheme B: host↔renderer whitelisted envelope.
 * Keep in sync with `apps/electron` main + preload.
 */
export const SYNRA_HOST_ENVELOPE_PUSH_CHANNEL = 'synra:host:envelope' as const
export const SYNRA_HOST_ENVELOPE_INVOKE_CHANNEL = 'synra:host:envelope:invoke' as const
