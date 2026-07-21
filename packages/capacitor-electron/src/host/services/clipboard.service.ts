import type { ReadClipboardResult } from '../../shared/protocol/types'
import type { ClipboardAdapter } from '../adapters/electron-clipboard.adapter'

/**
 * Cross-platform clipboard reader for the Synra Electron host.
 *
 * The plugin-side `_plugin.<slug>.copy-selection` handler asks the
 * paired PC to push whatever is currently in its OS clipboard back
 * over the LAN envelope, so the phone can auto-paste it via
 * `navigator.clipboard.writeText`.
 *
 * The actual `clipboard.readText()` call lives in the platform
 * adapter (mirrors `electron-shell.adapter`) so this package stays
 * free of an `electron` peer dependency — Capacitor native builds
 * never load the Electron module, but the bridge still has to type
 * the result shape.
 */
export type ClipboardService = {
  readText(): Promise<ReadClipboardResult>
}

export function createClipboardService(clipboardAdapter: ClipboardAdapter): ClipboardService {
  return {
    async readText(): Promise<ReadClipboardResult> {
      const text = await clipboardAdapter.readText()
      return { text }
    }
  }
}
