export type SynraClipboardWriteOptions = {
  text: string
}

export type SynraClipboardReadResult = {
  text: string
}

export interface SynraClipboardPlugin {
  read(): Promise<SynraClipboardReadResult>
  write(options: SynraClipboardWriteOptions): Promise<void>
}
