export type ClipboardAdapter = {
  readText(): Promise<string>
  /**
   * Capture the host's current text selection by triggering the
   * platform's native copy shortcut (Ctrl+C / Cmd+C / xdotool ctrl+c),
   * reading the resulting clipboard content, then restoring the
   * original clipboard so the operation is non-destructive for the
   * user. Returns the selection text, or an empty string when no
   * selection exists or the platform automation is unavailable.
   */
  readSelection(): Promise<string>
  writeText(text: string): Promise<void>
}

/**
 * Wrap a platform-provided clipboard implementation as a `ClipboardAdapter`.
 *
 * The implementation must be supplied explicitly — there is intentionally
 * no default fallback. Silently returning `''` from a forgotten
 * `clipboardAdapter` looked like the bridge was working but always
 * failed, which was hard to diagnose. Callers that don't have a real
 * host (unit tests) should pass `vi.fn(async () => '')` from their test
 * file; production callers must wire the platform's actual clipboard.
 */
export function createClipboardAdapter(implementation: ClipboardAdapter): ClipboardAdapter {
  return {
    async readText(): Promise<string> {
      return await implementation.readText()
    },
    async readSelection(): Promise<string> {
      return await implementation.readSelection()
    },
    async writeText(text: string): Promise<void> {
      await implementation.writeText(text)
    }
  }
}
