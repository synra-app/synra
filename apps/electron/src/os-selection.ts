/**
 * OS-level "capture the current text selection" helper.
 *
 * The plugin-side `_plugin.<slug>.copy-selection` handler asks the
 * paired PC for whatever the user currently has highlighted by the
 * cursor. The OS clipboard is NOT the same thing — it is whatever
 * was last copied. To get the actual selection we trigger the
 * platform's native copy shortcut, wait briefly for the OS to
 * populate the clipboard, read it back, then restore the original
 * clipboard content so the action is non-destructive for the user.
 *
 * Implementation strategy: shell out to the OS-native automation
 * tools that ship with / are bundled by every desktop platform —
 *
 *   - Windows: `powershell.exe` with `System.Windows.Forms.SendKeys`
 *     (`Add-Type -AssemblyName System.Windows.Forms`).
 *   - macOS:   `osascript` invoking `System Events` to fire the
 *     "Cmd+C" key combo. Requires Accessibility permission for the
 *     Electron app under System Settings → Privacy & Security.
 *   - Linux:   `xdotool key --clearmodifiers ctrl+c`. Requires
 *     `xdotool` to be installed (standard on most desktop distros
 *     but not always present on headless / minimal servers).
 *
 * No native dependencies are pulled in — `child_process.execFile` is
 * the only Node API we touch here, so this module stays small and
 * stays out of the way of the Electron renderer ↔ main IPC.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/**
 * Wall-clock budget (ms) between firing the OS copy shortcut and
 * reading the clipboard back. 120ms covers Windows SendKeys →
 * focused window → clipboard update (the slowest of the three);
 * macOS / xdotool typically finish in <20ms but we leave headroom
 * for slow / loaded machines.
 */
const POST_COPY_DELAY_MS = 120

/**
 * Read the host's current text selection by triggering Ctrl+C (or
 * Cmd+C on macOS), then returning the clipboard content. The
 * selection itself is never returned directly — it is the side effect
 * of the copy shortcut that we read back from the OS clipboard.
 *
 * Flow:
 *   1. snapshot = clipboard.readText() — to restore later
 *   2. fire native copy shortcut (Ctrl+C / Cmd+C / xdotool ctrl+c)
 *   3. sleep POST_COPY_DELAY_MS so the OS can update the clipboard
 *   4. selection = clipboard.readText() — that IS the selection
 *   5. clipboard.writeText(snapshot) — restore the original
 *   6. return selection
 *
 * On any failure (tool missing, permission denied, timeout) returns
 * an empty string so the caller still gets a well-formed response;
 * the host logs `[synra][cb-sel-fail]` and surfaces
 * `ok: true, text: ''` to the phone (consistent with the existing
 * `clipboard.read` semantics).
 */
export async function captureOsTextSelection(args: {
  platform: NodeJS.Platform
  readClipboard: () => string
  writeClipboard: (text: string) => void
}): Promise<string> {
  const { platform, readClipboard, writeClipboard } = args
  const snapshot = readClipboard()
  try {
    const fired = await dispatchCopyShortcut(platform)
    if (!fired) {
      return ''
    }
    await sleep(POST_COPY_DELAY_MS)
    return readClipboard()
  } catch {
    return ''
  } finally {
    // Best-effort restore. If the user already copied something else
    // between the trigger and this restore call, we lose that — but
    // the original snapshot we took is at least what the user had
    // before our automation kicked in.
    try {
      writeClipboard(snapshot)
    } catch {
      // ignore: clipboard restore is non-essential
    }
  }
}

async function dispatchCopyShortcut(platform: NodeJS.Platform): Promise<boolean> {
  if (platform === 'win32') {
    return dispatchWindowsCopy()
  }
  if (platform === 'darwin') {
    return dispatchMacCopy()
  }
  // Linux + every other unix: try xdotool.
  return dispatchLinuxCopy()
}

async function dispatchWindowsCopy(): Promise<boolean> {
  // `^c` is Ctrl+C in SendKeys syntax. The script loads WinForms
  // (SendKeys lives there) and fires the keystroke. `-NoProfile`
  // keeps the shell startup cheap; `-NonInteractive` avoids
  // PowerShell waiting for input.
  const script =
    'Add-Type -AssemblyName System.Windows.Forms; ' +
    '[System.Windows.Forms.SendKeys]::SendWait("^c")'
  try {
    await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script])
    return true
  } catch {
    return false
  }
}

async function dispatchMacCopy(): Promise<boolean> {
  // AppleScript fires "Cmd+C" via System Events. Requires the
  // Electron app to have Accessibility permission under
  // System Settings → Privacy & Security → Accessibility.
  const script = 'tell application "System Events" to keystroke "c" using {command down}'
  try {
    await execFileAsync('osascript', ['-e', script])
    return true
  } catch {
    return false
  }
}

async function dispatchLinuxCopy(): Promise<boolean> {
  // `--clearmodifiers` releases any held modifier keys (Shift, Ctrl,
  // Alt) before firing the combo, so the keystroke is recognised even
  // if the user happened to be holding Shift from a prior selection
  // drag. ENOENT (xdotool missing) → false.
  try {
    await execFileAsync('xdotool', ['key', '--clearmodifiers', 'ctrl+c'])
    return true
  } catch {
    return false
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}
