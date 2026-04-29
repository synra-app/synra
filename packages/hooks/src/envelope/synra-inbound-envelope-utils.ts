import type { SynraInboundEnvelope, SynraMessageEnvelope } from '@synra/envelope'

/**
 * Deep-copies whitelist envelope fields explicitly (no object spread).
 * SYNRA-COMM::MESSAGE_ENVELOPE::RECEIVE::SYNRA_ENVELOPE_SUBSCRIBE
 */
export function cloneSynraMessageEnvelope(src: SynraMessageEnvelope): SynraMessageEnvelope {
  return {
    requestId: src.requestId,
    event: src.event,
    target: src.target,
    from: src.from,
    replyRequestId: src.replyRequestId,
    payload: src.payload,
    timestamp: src.timestamp
  }
}

/** Same whitelist fields as `src`, with `event` replaced. */
export function synraMessageEnvelopeWithEvent(
  src: SynraMessageEnvelope,
  event: string
): SynraMessageEnvelope {
  return {
    requestId: src.requestId,
    event,
    target: src.target,
    from: src.from,
    replyRequestId: src.replyRequestId,
    payload: src.payload,
    timestamp: src.timestamp
  }
}

/** Keeps `kind`; replaces `envelope` with an explicit copy of `envelope`. */
export function synraInboundEnvelopeWithEnvelope(
  inbound: SynraInboundEnvelope,
  envelope: SynraMessageEnvelope
): SynraInboundEnvelope {
  return {
    kind: inbound.kind,
    envelope: cloneSynraMessageEnvelope(envelope)
  }
}
