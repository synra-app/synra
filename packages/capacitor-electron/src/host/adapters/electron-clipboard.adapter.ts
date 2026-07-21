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

export function createClipboardAdapter(
  implementation: Pick<ClipboardAdapter, 'readText' | 'readSelection' | 'writeText'> = {
    async readText() {
      return ''
    },
    async readSelection() {
      // default no-op; adapter host (Electron main) supplies a real
      // implementation that triggers the OS copy shortcut.
      return ''
    },
    async writeText() {
      // default no-op; adapter host (Electron main) supplies a real implementation
    }
  }
): ClipboardAdapter {
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
