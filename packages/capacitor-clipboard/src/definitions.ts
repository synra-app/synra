import type { MethodPayloadMap, MethodResultMap } from '@synra/bridge-schema'

/**
 * Clipboard plugin public types.
 *
 * The underlying wire shape (`'clipboard.read'` / `'clipboard.write'`,
 * `Record<string, never>` payload, `{ text }` payload, `{ text }` result)
 * is canonical in `@synra/bridge-schema`'s `MethodPayloadMap` and
 * `MethodResultMap`. Deriving these aliases from those maps makes drift
 * a compile error — if anyone changes the canonical schema, this file
 * fails to build until the plugin's own type names are reconciled.
 */

// `clipboard.write` payload → `{ text: string }` in canonical schema.
export type SynraClipboardWriteOptions = MethodPayloadMap['clipboard.write']

// `clipboard.read` result → `{ text: string }` in canonical schema.
export type SynraClipboardReadResult = MethodResultMap['clipboard.read']

export interface SynraClipboardPlugin {
  read(): Promise<SynraClipboardReadResult>
  write(options: SynraClipboardWriteOptions): Promise<void>
}
