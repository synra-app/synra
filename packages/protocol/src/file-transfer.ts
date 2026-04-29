/** Discriminator for file transfer payloads; extend in protocol when adding kinds. */
export type FileTransferKind = 'plugin-bundle' | 'attachment'

export type FileTransferRequestPayload =
  | {
      transferId: string
      kind: 'plugin-bundle'
      pluginId: string
      version: string
      byteLength?: number
      syncSessionId?: string
    }
  | {
      transferId: string
      kind: 'attachment'
      fileName: string
      byteLength?: number
      mimeType?: string
      contextId?: string
      syncSessionId?: string
    }

export type FileTransferChunkPayload =
  | {
      transferId: string
      kind: 'plugin-bundle'
      pluginId: string
      version: string
      chunkIndex: number
      totalChunks: number
      chunkBase64: string
      syncSessionId?: string
    }
  | {
      transferId: string
      kind: 'attachment'
      fileName: string
      chunkIndex: number
      totalChunks: number
      chunkBase64: string
      syncSessionId?: string
      contextId?: string
    }

export type FileTransferCompletePayload =
  | {
      transferId: string
      kind: 'plugin-bundle'
      pluginId: string
      version: string
      totalChunks: number
      sha256?: string
      syncSessionId?: string
    }
  | {
      transferId: string
      kind: 'attachment'
      fileName: string
      totalChunks: number
      sha256?: string
      syncSessionId?: string
      contextId?: string
    }

export type FileTransferAbortPayload = {
  transferId: string
  reason?: string
  /** Prefer values from SynraErrorCode when emitted by app logic. */
  code?: string
}

/** Session-level progress / checkpoint (optional wire event). Not TCP frame ACK. */
export type FileTransferProgressPayload = {
  transferId: string
  /** Inclusive highest chunk index processed (0-based). */
  receivedThroughChunkIndex: number
  syncSessionId?: string
}

export function fileTransferChunkCount(byteLength: number, chunkSize: number): number {
  return Math.max(1, Math.ceil(byteLength / chunkSize))
}

function uint8ToBase64Chunk(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64')
  }
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return btoa(binary)
}

/**
 * Outbound plugin-bundle chunks over `file.transfer.chunk` payloads (session layer).
 * SYNRA-COMM::FILE_TRANSFER::SEND::CHUNK_ENCODE
 */
export function* iteratePluginBundleChunks(options: {
  transferId: string
  buffer: Uint8Array
  chunkSize: number
  pluginId: string
  version: string
  syncSessionId?: string
}): Generator<Extract<FileTransferChunkPayload, { kind: 'plugin-bundle' }>> {
  const totalChunks = fileTransferChunkCount(options.buffer.length, options.chunkSize)
  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
    const start = chunkIndex * options.chunkSize
    const slice = options.buffer.subarray(
      start,
      Math.min(options.buffer.length, start + options.chunkSize)
    )
    yield {
      transferId: options.transferId,
      kind: 'plugin-bundle',
      pluginId: options.pluginId,
      version: options.version,
      chunkIndex,
      totalChunks,
      chunkBase64: uint8ToBase64Chunk(slice),
      syncSessionId: options.syncSessionId
    }
  }
}

function base64ToUint8(base64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'))
  }
  const bin = atob(base64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i)
  }
  return out
}

/**
 * Assembles plugin-bundle transfer chunks in memory (receive path).
 * SYNRA-COMM::FILE_TRANSFER::RECEIVE::ASSEMBLE_BUFFER
 */
/** Observable receive progress for UI/analytics later; no wire event required. */
export type PluginBundleTransferProgressSnapshot = {
  transferId: string
  pluginId: string
  version: string
  chunksReceived: number
  totalChunks: number
  bytesReceived: number
}

export class PluginBundleTransferAssembly {
  private readonly chunks = new Map<number, Uint8Array>()
  private expectedTotalChunks = 0
  private pluginId = ''
  private version = ''

  constructor(readonly transferId: string) {}

  /** Returns error message if chunk is invalid for this assembly. */
  push(payload: Extract<FileTransferChunkPayload, { kind: 'plugin-bundle' }>): string | undefined {
    if (payload.transferId !== this.transferId) {
      return 'transferId mismatch'
    }
    if (payload.kind !== 'plugin-bundle') {
      return 'kind mismatch'
    }
    if (payload.chunkIndex < 0 || payload.totalChunks < 1) {
      return 'invalid chunk indices'
    }
    if (this.expectedTotalChunks === 0) {
      this.expectedTotalChunks = payload.totalChunks
    } else if (payload.totalChunks !== this.expectedTotalChunks) {
      return 'totalChunks changed'
    }
    if (payload.chunkIndex >= this.expectedTotalChunks) {
      return 'chunkIndex out of range'
    }
    if (this.chunks.has(payload.chunkIndex)) {
      return undefined
    }
    if (this.pluginId.length === 0) {
      this.pluginId = payload.pluginId
      this.version = payload.version
    }
    this.chunks.set(payload.chunkIndex, base64ToUint8(payload.chunkBase64))
    return undefined
  }

  /**
   * Chunk/session stats for progress bars or logging without `file.transfer.progress` on the wire.
   * SYNRA-COMM::FILE_TRANSFER::RECEIVE::ASSEMBLE_BUFFER
   */
  getProgressSnapshot(): PluginBundleTransferProgressSnapshot {
    let bytesReceived = 0
    for (const u8 of this.chunks.values()) {
      bytesReceived += u8.length
    }
    return {
      transferId: this.transferId,
      pluginId: this.pluginId,
      version: this.version,
      chunksReceived: this.chunks.size,
      totalChunks: this.expectedTotalChunks,
      bytesReceived
    }
  }

  isComplete(): boolean {
    return this.expectedTotalChunks > 0 && this.chunks.size === this.expectedTotalChunks
  }

  /** Concatenates in chunk index order; only call when `isComplete()`. */
  concat(): Uint8Array {
    let totalLen = 0
    for (let i = 0; i < this.expectedTotalChunks; i++) {
      const part = this.chunks.get(i)
      if (!part) {
        throw new Error('missing chunk')
      }
      totalLen += part.length
    }
    const out = new Uint8Array(totalLen)
    let offset = 0
    for (let i = 0; i < this.expectedTotalChunks; i++) {
      const part = this.chunks.get(i)!
      out.set(part, offset)
      offset += part.length
    }
    return out
  }
}
