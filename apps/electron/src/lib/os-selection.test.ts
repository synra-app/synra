import { describe, expect, test, vi } from 'vite-plus/test'
import { captureOsTextSelection, POST_COPY_DELAY_MS } from './os-selection'

/**
 * Unit tests for `captureOsTextSelection`. We inject a fake
 * `dispatcher` (so the test never spawns `powershell.exe` / `osascript`
 * / `xdotool`) and a fake clipboard (`readClipboard` / `writeClipboard`)
 * that we mutate between calls. Each test asserts:
 *
 *   1. The snapshot taken before the copy shortcut fires is restored
 *      to the clipboard once capture returns (success or failure).
 *   2. The dispatcher is invoked with the platform-correct command
 *      + args (`powershell.exe …^c` on win32, `osascript -e …Cmd+C`
 *      on darwin, `xdotool key --clearmodifiers ctrl+c` on linux).
 *   3. Failure paths (dispatcher throws, dispatcher returns falsy
 *      because of an unhandled rejection) yield an empty string,
 *      matching the contract documented in `os-selection.ts`.
 *
 * `delayMs: 0` is passed everywhere so tests don't sleep.
 */

describe('captureOsTextSelection', () => {
  test('windows: fires powershell SendKeys ^c, returns selection, restores snapshot', async () => {
    const dispatcher = vi.fn(async () => undefined)
    const writes: string[] = []
    const reads: string[] = []
    let clipboard = 'snapshot-before'
    const text = await captureOsTextSelection({
      platform: 'win32',
      readClipboard: () => {
        // First read captures the snapshot; the second read captures
        // the selection (the test simulates the OS having populated
        // the clipboard with the selection by the time we re-read).
        if (reads.length === 0) {
          reads.push(clipboard)
          return clipboard
        }
        const sel = 'highlighted text'
        reads.push(sel)
        clipboard = sel
        return sel
      },
      writeClipboard: (t) => {
        writes.push(t)
        clipboard = t
      },
      dispatcher,
      delayMs: 0
    })

    expect(text).toBe('highlighted text')
    expect(dispatcher).toHaveBeenCalledTimes(1)
    expect(dispatcher).toHaveBeenCalledWith('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      expect.stringContaining('SendWait("^c")')
    ])
    // Restored the original snapshot, not the selection.
    expect(writes.at(-1)).toBe('snapshot-before')
  })

  test('macos: fires osascript Cmd+C, returns selection, restores snapshot', async () => {
    const dispatcher = vi.fn(async () => undefined)
    let clipboard = 'orig'
    let reads = 0
    const text = await captureOsTextSelection({
      platform: 'darwin',
      readClipboard: () => {
        reads += 1
        return reads === 1 ? clipboard : 'pasted line'
      },
      writeClipboard: (t) => {
        clipboard = t
      },
      dispatcher,
      delayMs: 0
    })

    expect(text).toBe('pasted line')
    expect(dispatcher).toHaveBeenCalledWith('osascript', [
      '-e',
      expect.stringContaining('keystroke "c" using {command down}')
    ])
    expect(clipboard).toBe('orig')
  })

  test('linux: fires xdotool --clearmodifiers ctrl+c', async () => {
    const dispatcher = vi.fn(async () => undefined)
    const text = await captureOsTextSelection({
      platform: 'linux',
      readClipboard: () => 'snapshot',
      writeClipboard: () => undefined,
      dispatcher,
      delayMs: 0
    })

    expect(text).toBe('snapshot')
    expect(dispatcher).toHaveBeenCalledWith('xdotool', ['key', '--clearmodifiers', 'ctrl+c'])
  })

  test('returns "" when dispatcher throws (xdotool missing / Accessibility denied)', async () => {
    const dispatcher = vi.fn(async () => {
      throw new Error('spawn xdotool ENOENT')
    })
    const text = await captureOsTextSelection({
      platform: 'linux',
      readClipboard: () => 'snapshot',
      writeClipboard: () => undefined,
      dispatcher,
      delayMs: 0
    })

    expect(text).toBe('')
  })

  test('restores snapshot even when readClipboard throws after the dispatcher fired', async () => {
    const writes: string[] = []
    const dispatcher = vi.fn(async () => undefined)
    let reads = 0
    await captureOsTextSelection({
      platform: 'darwin',
      readClipboard: () => {
        // First read captures the snapshot ("snapshot"); second read
        // simulates the OS automation step failing (clipboard blew up
        // after the dispatcher fired). The snapshot we took before the
        // dispatcher fired must still be restored.
        reads += 1
        if (reads === 1) {
          return 'snapshot'
        }
        throw new Error('clipboard read blew up')
      },
      writeClipboard: (t) => writes.push(t),
      dispatcher,
      delayMs: 0
    })

    // Snapshot was taken before the dispatcher fired, so it should be
    // restored even on the read failure.
    expect(writes).toEqual(['snapshot'])
  })

  test('exports POST_COPY_DELAY_MS as a tunable knob (default 120ms)', () => {
    expect(POST_COPY_DELAY_MS).toBe(120)
  })
})
