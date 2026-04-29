import type {
  FileTransferAbortPayload,
  FileTransferChunkPayload,
  FileTransferCompletePayload,
  FileTransferRequestPayload
} from '@synra/protocol'
import type { SynraMessageEnvelope } from '@synra/envelope'
import { useSynraEnvelope } from '../envelope/use-synra-envelope'

type SendBase = Partial<SynraMessageEnvelope> & Pick<SynraMessageEnvelope, 'target'>

/**
 * Session-layer helpers for logical `file.transfer.*` events over `useSynraEnvelope`.
 * Plugin UI should use `useSynraPluginEnvelope` instead: pass the same logical names (`file.transfer.chunk`, …);
 * wire `event` becomes `_plugin.{slug}.file.transfer.*` via `toPluginWireEvent`, same as other plugin events.
 * SYNRA-COMM::FILE_TRANSFER::SEND::HOOK_FILE_TRANSFER_POST
 * SYNRA-COMM::MESSAGE_ENVELOPE::SEND::SYNRA_ENVELOPE_POST
 */
export function useFileTransfer() {
  const envelope = useSynraEnvelope()

  async function sendRequest(
    base: SendBase & { payload: FileTransferRequestPayload }
  ): Promise<SynraMessageEnvelope> {
    return envelope.send({ ...base, event: 'file.transfer.request' })
  }

  async function sendChunk(
    base: SendBase & { payload: FileTransferChunkPayload }
  ): Promise<SynraMessageEnvelope> {
    return envelope.send({ ...base, event: 'file.transfer.chunk' })
  }

  async function sendComplete(
    base: SendBase & { payload: FileTransferCompletePayload }
  ): Promise<SynraMessageEnvelope> {
    return envelope.send({ ...base, event: 'file.transfer.complete' })
  }

  async function sendAbort(
    base: SendBase & { payload: FileTransferAbortPayload }
  ): Promise<SynraMessageEnvelope> {
    return envelope.send({ ...base, event: 'file.transfer.abort' })
  }

  return {
    getRuntimeSurface: envelope.getRuntimeSurface,
    send: envelope.send,
    subscribe: envelope.subscribe,
    request: envelope.request,
    sendRequest,
    sendChunk,
    sendComplete,
    sendAbort
  }
}
