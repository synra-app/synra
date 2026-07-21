import { WebPlugin } from '@capacitor/core'
import type {
  SynraClipboardPlugin,
  SynraClipboardReadResult,
  SynraClipboardWriteOptions
} from './definitions'

type WebClipboardLike = {
  readText?: () => Promise<string>
  writeText?: (text: string) => Promise<void>
}

function getWebClipboard(): WebClipboardLike | null {
  if (typeof navigator === 'undefined') return null
  const candidate = (navigator as Navigator & { clipboard?: WebClipboardLike }).clipboard
  if (!candidate) return null
  return candidate
}

export class SynraClipboardWeb extends WebPlugin implements SynraClipboardPlugin {
  async read(): Promise<SynraClipboardReadResult> {
    const clip = getWebClipboard()
    if (!clip || typeof clip.readText !== 'function') {
      // Fallback: empty string. Host must guarantee a clipboard exists; web
      // browsers without the Async Clipboard API still expose `document.execCommand`
      // but that path is deprecated and not worth wiring here. Plugins
      // running on Electron / Capacitor native will never hit this branch.
      return { text: '' }
    }
    const text = await clip.readText()
    return { text }
  }

  async write(options: SynraClipboardWriteOptions): Promise<void> {
    const clip = getWebClipboard()
    if (!clip || typeof clip.writeText !== 'function') {
      throw this.unavailable('navigator.clipboard is unavailable in this WebView.')
    }
    await clip.writeText(options.text)
  }
}
