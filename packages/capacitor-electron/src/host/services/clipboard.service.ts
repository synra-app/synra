import type { ReadClipboardResult } from '../../shared/protocol/types'
import type { ClipboardAdapter } from '../adapters/electron-clipboard.adapter'

/**
 * Cross-platform clipboard reader for the Synra Electron host.
 *
 * Two related but distinct operations live here:
 *
 * - `readText()` returns the current OS clipboard content (last copied).
 *   Backed by `clipboard.readText()` on Electron.
 * - `readSelection()` returns whatever the user currently has
 *   highlighted by the cursor on the host machine. Implementation
 *   triggers the host's native copy shortcut (Ctrl+C / Cmd+C /
 *   xdotool ctrl+c), waits for the OS to populate the clipboard,
 *   reads it back, and restores the original clipboard content so
 *   the operation is non-destructive for the user.
 *
 * The phone's plugin-side `_plugin.<slug>.copy-selection` handler
 * asks the paired PC to capture its current selection and reply over
 * the LAN envelope, so the phone can auto-paste it via
 * `navigator.clipboard.writeText`.
 *
 * The actual native calls live in the platform adapter (mirrors
 * `electron-shell.adapter`) so this package stays free of an
 * `electron` peer dependency — Capacitor native builds never load the
 * Electron module, but the bridge still has to type the result shape.
 */
export type ClipboardService = {
  readText(): Promise<ReadClipboardResult>
  readSelection(): Promise<ReadClipboardResult>
  writeText(text: string): Promise<void>
}

export function createClipboardService(clipboardAdapter: ClipboardAdapter): ClipboardService {
  return {
    async readText(): Promise<ReadClipboardResult> {
      const text = await clipboardAdapter.readText()
      return { text }
    },
    async readSelection(): Promise<ReadClipboardResult> {
      const text = await clipboardAdapter.readSelection()
      return { text }
    },
    async writeText(text: string): Promise<void> {
      await clipboardAdapter.writeText(text)
    }
  }
}
