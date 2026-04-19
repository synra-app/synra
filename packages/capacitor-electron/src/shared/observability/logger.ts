import type { BridgeErrorCode } from '../errors/codes'

export type BridgeLogRecord = {
  requestId: string
  method: string
  durationMs: number
  status: 'ok' | 'error'
  errorCode?: BridgeErrorCode
}

export type BridgeLogger = {
  log(record: BridgeLogRecord): void
}

export const noopBridgeLogger: BridgeLogger = {
  log() {
    // No-op default logger.
  }
}
