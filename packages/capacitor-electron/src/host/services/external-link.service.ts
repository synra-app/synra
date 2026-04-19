import { BridgeError } from '../../shared/errors/bridge-error'
import { BRIDGE_ERROR_CODES } from '../../shared/errors/codes'
import type { OperationResult } from '../../shared/protocol/types'
import type { ShellAdapter } from '../adapters/electron-shell.adapter'

export type ExternalLinkService = {
  openExternal(url: string): Promise<OperationResult>
}

export function createExternalLinkService(shellAdapter: ShellAdapter): ExternalLinkService {
  return {
    async openExternal(url: string): Promise<OperationResult> {
      let parsed: URL

      try {
        parsed = new URL(url)
      } catch {
        throw new BridgeError(BRIDGE_ERROR_CODES.invalidParams, 'Invalid URL.')
      }

      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new BridgeError(BRIDGE_ERROR_CODES.unauthorized, 'URL protocol is not allowed.')
      }

      await shellAdapter.openExternal(parsed.toString())

      return { success: true }
    }
  }
}
