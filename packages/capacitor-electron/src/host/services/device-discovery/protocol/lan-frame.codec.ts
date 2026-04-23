import { BridgeError } from '../../../../shared/errors/bridge-error'
import { BRIDGE_ERROR_CODES } from '../../../../shared/errors/codes'

export const LAN_PROTOCOL_VERSION = '1.0'
export const LAN_APP_ID = 'synra'
export const MAX_FRAME_BYTES = 256 * 1024

export type LanFrame = {
  version: string
  type:
    | 'connect'
    | 'connectAck'
    | 'event'
    | 'message'
    | 'ack'
    | 'close'
    | 'error'
    | 'heartbeat'
    | 'hostRetire'
    | 'memberOffline'
  sessionId?: string
  messageId?: string
  timestamp: number
  appId?: string
  protocolVersion?: string
  capabilities?: string[]
  payload?: unknown
  error?: string
}

export interface LanFrameCodec {
  encode(frame: LanFrame): Buffer
  decodeChunk(chunk: Buffer): LanFrame[]
  reset(): void
}

export class LengthPrefixedJsonCodec implements LanFrameCodec {
  private buffer = Buffer.allocUnsafe(1024)
  private length = 0

  public encode(frame: LanFrame): Buffer {
    const payload = Buffer.from(JSON.stringify(frame), 'utf8')
    if (payload.length > MAX_FRAME_BYTES) {
      throw new BridgeError(BRIDGE_ERROR_CODES.invalidParams, 'Frame payload is too large.', {
        bytes: payload.length,
        maxBytes: MAX_FRAME_BYTES
      })
    }
    const output = Buffer.allocUnsafe(payload.length + 4)
    output.writeUInt32BE(payload.length, 0)
    payload.copy(output, 4)
    return output
  }

  public decodeChunk(chunk: Buffer): LanFrame[] {
    this.ensureCapacity(chunk.length)
    chunk.copy(this.buffer, this.length)
    this.length += chunk.length

    const frames: LanFrame[] = []
    let cursor = 0

    while (this.length - cursor >= 4) {
      const frameLength = this.buffer.readUInt32BE(cursor)
      if (frameLength > MAX_FRAME_BYTES) {
        cursor += 4
        continue
      }
      if (this.length - cursor < frameLength + 4) {
        break
      }
      const start = cursor + 4
      const end = start + frameLength
      try {
        const frame = JSON.parse(this.buffer.toString('utf8', start, end)) as LanFrame
        frames.push(frame)
      } catch {
        // Ignore malformed frame.
      }
      cursor = end
    }

    if (cursor > 0) {
      this.buffer.copyWithin(0, cursor, this.length)
      this.length -= cursor
    }

    return frames
  }

  public reset(): void {
    this.length = 0
  }

  private ensureCapacity(extraBytes: number): void {
    const required = this.length + extraBytes
    if (required <= this.buffer.length) {
      return
    }
    let nextSize = this.buffer.length
    while (nextSize < required) {
      nextSize *= 2
    }
    const next = Buffer.allocUnsafe(nextSize)
    this.buffer.copy(next, 0, 0, this.length)
    this.buffer = next
  }
}
