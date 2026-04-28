import { getHooksRuntimeOptions } from '../runtime/config'

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

/**
 * Match `useTransport` `resolveWireFrom` / `requireLocalFromUuid` for outbound `from`.
 * SYNRA-COMM::MESSAGE_ENVELOPE::SEND::SYNRA_ENVELOPE_RESOLVE_FROM
 */
export function resolveWireFromForSynra(inputFrom?: string): string {
  if (typeof inputFrom === 'string' && inputFrom.trim().length > 0) {
    const trimmed = inputFrom.trim()
    if (!isUuidLike(trimmed)) {
      throw new Error('Message from must be a UUID.')
    }
    return trimmed
  }
  const localUuid = getHooksRuntimeOptions().localDiscoveryDeviceId?.trim() ?? ''
  if (!isUuidLike(localUuid)) {
    throw new Error('Local device UUID is unavailable.')
  }
  return localUuid
}
