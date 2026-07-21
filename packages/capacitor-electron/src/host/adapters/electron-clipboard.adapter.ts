export type ClipboardAdapter = {
  readText(): Promise<string>
}

export function createClipboardAdapter(
  implementation: Pick<ClipboardAdapter, 'readText'> = {
    async readText() {
      return ''
    }
  }
): ClipboardAdapter {
  return {
    async readText(): Promise<string> {
      return await implementation.readText()
    }
  }
}
