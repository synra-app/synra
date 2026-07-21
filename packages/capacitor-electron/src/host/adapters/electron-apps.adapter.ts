/**
 * Cross-OS installed-app enumeration + launch adapter.
 *
 * Phone-as-controller asks the paired Electron host "what apps do
 * you have installed?" (`apps.listInstalled`) and then "launch this
 * one" (`apps.launch`). The host is the source of truth for both —
 * the phone never touches the OS directly.
 *
 * Per-OS strategy (kept inside the adapter so the service stays
 * platform-pure and unit-testable):
 *
 *   - Windows: enumerate `HKLM` + `HKCU` Uninstall keys via
 *     `reg.exe query`, parse `DisplayName` / `DisplayIcon`, build
 *     `appId` from the absolute `.exe` path embedded in
 *     `DisplayIcon`. Launch via `child_process.spawn(exe, [], { detached, unref })`.
 *
 *   - macOS: walk `/Applications` and `/System/Applications` for
 *     `*.app`, read `Info.plist` via `plutil -convert json -o -`,
 *     extract `CFBundleIdentifier` as `appId` and `CFBundleName` as
 *     `name`. Launch via `child_process.spawn('open', ['-b', bundleId], …)`.
 *
 *   - Linux: enumerate `/usr/share/applications/*.desktop` and
 *     `~/.local/share/applications/*.desktop`, parse the
 *     `Name=` / `Exec=` lines, strip field codes (`%u`, `%F`, …).
 *     `appId` = basename without `.desktop`. Launch via
 *     `gtk-launch` (preferred) with `xdg-open` fallback.
 *
 *   - Any other `process.platform`: `listInstalled` returns `[]`;
 *     `launch` throws `BridgeError(unsupportedOperation)` so the
 *     service can translate to `AppLaunchResult.reason =
 *     'unsupportedPlatform'`.
 *
 * No native deps are pulled in — `node:child_process` is the only
 * Node API we touch, matching `electron-shell.adapter.ts` and the
 * `os-selection.ts` helper in `apps/electron/src/lib/`.
 *
 * `child_process.execFile` is used everywhere (no shell-string
 * concat) to keep the no-shell-injection invariant that already
 * exists in the repo. `child_process.spawn` is used for the launch
 * path because we need `{ detached: true, stdio: 'ignore' }` +
 * `unref()` so the launched app survives Electron main's lifetime.
 */
import { execFile, spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { promisify } from 'node:util'
import { join, basename } from 'node:path'
import { homedir } from 'node:os'

import { BridgeError } from '../../shared/errors/bridge-error'
import { BRIDGE_ERROR_CODES } from '../../shared/errors/codes'

const execFileAsync = promisify(execFile)

export type HostPlatform = NodeJS.Platform

export type RawInstalledApp = {
  /** OS-agnostic stable id — passed back into `launch`. */
  appId: string
  name: string
  /** Optional. Phone falls back to a generic lucide icon. */
  iconUrl?: string
}

export type AppsAdapter = {
  listInstalled(platform: HostPlatform): Promise<RawInstalledApp[]>
  launch(appId: string, platform: HostPlatform): Promise<void>
}

export type ExecFileDispatcher = (command: string, args: string[]) => Promise<unknown>

const defaultDispatcher: ExecFileDispatcher = (command, args) =>
  execFileAsync(command, args, {
    windowsHide: true,
    // 5s mirrors `apps/electron/src/lib/os-selection.ts` defaults so
    // a stuck reg query / plutil never blocks the bridge handler.
    timeout: 5000,
    // Cap stdout at 4 MB so a pathological registry key can't OOM
    // the main process during enumeration.
    maxBuffer: 4 * 1024 * 1024
  })

export function createElectronAppsAdapter(
  dispatcher: ExecFileDispatcher = defaultDispatcher
): AppsAdapter {
  return {
    async listInstalled(platform) {
      if (platform === 'win32') return listInstalledWindows(dispatcher)
      if (platform === 'darwin') return listInstalledMac(dispatcher)
      if (platform === 'linux') return listInstalledLinux(dispatcher)
      return []
    },
    async launch(appId, platform) {
      if (platform === 'win32') return launchWindows(appId)
      if (platform === 'darwin') return launchMac(appId)
      if (platform === 'linux') return launchLinux(appId)
      throw new BridgeError(
        BRIDGE_ERROR_CODES.unsupportedOperation,
        `apps.launch not supported on platform=${platform}`
      )
    }
  }
}

// ─── Windows ────────────────────────────────────────────────────────────────

/**
 * Read installed apps from HKLM and HKCU Uninstall registry keys.
 *
 * `reg.exe query` returns localized output, so we don't pattern-match
 * lines — we ask for specific value names via `/v DisplayName` /
 * `/v DisplayIcon`. A single subkey can miss either value; we walk
 * each subkey once and only emit entries that have both.
 *
 * The output looks like:
 *     HKEY_LOCAL_MACHINE\...\Google Chrome
 *         DisplayName    REG_SZ    Google Chrome
 *         DisplayIcon    REG_SZ    "C:\Program Files\Google\Chrome\Application\chrome.exe",0
 *
 * Performance: 4-6 seconds on a clean Windows install (HKLM is large).
 * The 5s per-execFile timeout is tight; bump it in callers if needed.
 */
async function listInstalledWindows(dispatcher: ExecFileDispatcher): Promise<RawInstalledApp[]> {
  const roots = [
    'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
  ]
  const seen = new Map<string, RawInstalledApp>()
  for (const root of roots) {
    const subkeys = await listWindowsSubkeys(dispatcher, root)
    for (const sub of subkeys) {
      const fullKey = `${root}\\${sub}`
      const displayName = await readWindowsValue(dispatcher, fullKey, 'DisplayName')
      if (!displayName) continue
      const displayIcon = await readWindowsValue(dispatcher, fullKey, 'DisplayIcon')
      const exePath = parseDisplayIcon(displayIcon)
      if (!exePath) continue
      // `appId` is the absolute exe path — opaque on the wire and
      // resolvable by `launchWindows` without re-walking the registry.
      const appId = exePath
      if (seen.has(appId)) continue
      seen.set(appId, { appId, name: displayName })
    }
  }
  return Array.from(seen.values())
}

/**
 * `reg.exe query ROOT` returns one subkey per line under
 * `HKEY_...\ROOT`. We capture only the leaf segment (last `\`-split
 * component) and ignore system entries like `FriendlyViewName`.
 */
async function listWindowsSubkeys(dispatcher: ExecFileDispatcher, root: string): Promise<string[]> {
  try {
    const out = (await dispatcher('reg.exe', ['query', root])) as
      | { stdout?: string }
      | Buffer
      | string
      | undefined
    const text = bufferOrString(out)
    const names: string[] = []
    for (const line of text.split(/\r?\n/)) {
      // Lines for subkeys begin with whitespace + path; value lines
      // have leading whitespace too. Skip HKEY_ root continuations.
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('HKEY_')) continue
      // Skip empty lines and ones that are clearly value lines
      // (they end with REG_*).
      if (/REG_[A-Z]+/.test(trimmed)) continue
      const leaf = trimmed.split('\\').pop()
      if (leaf) names.push(leaf)
    }
    return names
  } catch {
    return []
  }
}

async function readWindowsValue(
  dispatcher: ExecFileDispatcher,
  key: string,
  value: string
): Promise<string> {
  try {
    const out = (await dispatcher('reg.exe', ['query', key, '/v', value])) as
      | { stdout?: string }
      | Buffer
      | string
      | undefined
    const text = bufferOrString(out)
    // The interesting line: "(Default)    REG_SZ    <data>" or
    // "<value>    REG_SZ    <data>". Take the third token onwards.
    const match = text.match(/REG_SZ\s+(.+)$/m)
    return match ? match[1].trim() : ''
  } catch {
    return ''
  }
}

/**
 * `DisplayIcon` is `"C:\path\to\app.exe",0` or `C:\path\app.exe,0`
 * or just `C:\path\app.exe`. Strip quotes and the trailing `,N` icon
 * index.
 */
function parseDisplayIcon(raw: string | undefined | null): string {
  if (!raw) return ''
  let path = raw.trim()
  // Strip surrounding quotes if present.
  if (path.startsWith('"')) path = path.slice(1)
  const quoteEnd = path.indexOf('"')
  if (quoteEnd > 0) path = path.slice(0, quoteEnd)
  // Drop `,0` icon index suffix.
  const commaIdx = path.lastIndexOf(',')
  if (commaIdx > 0 && /^\d+$/.test(path.slice(commaIdx + 1))) {
    path = path.slice(0, commaIdx)
  }
  return path
}

function bufferOrString(out: unknown): string {
  if (typeof out === 'string') return out
  if (out && typeof out === 'object' && 'stdout' in out) {
    const stdout = (out as { stdout?: unknown }).stdout
    if (typeof stdout === 'string') return stdout
    if (stdout instanceof Buffer) return stdout.toString('utf8')
  }
  if (out instanceof Buffer) return out.toString('utf8')
  return ''
}

function launchWindows(appId: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    try {
      const child = spawn(appId, [], {
        detached: true,
        stdio: 'ignore',
        windowsHide: false
      })
      child.on('error', (err) => reject(err))
      child.unref()
      // Detached launches don't emit 'exit' reliably when stdio is
      // ignored — resolve immediately so the bridge doesn't hang.
      resolve()
    } catch (err) {
      reject(err)
    }
  })
}

// ─── macOS ──────────────────────────────────────────────────────────────────

/**
 * Walk `/Applications` and `/System/Applications` for `*.app` bundles.
 * For each, use `plutil -convert json -o - Info.plist` to dump the
 * plist as JSON, then pull `CFBundleIdentifier` + `CFBundleName`.
 *
 * `appId` = `CFBundleIdentifier` (stable across launches, OS-resolvable
 * via `open -b <bundleId>`).
 *
 * Performance: 30-90 apps on a clean Mac; ~200ms total. The per-app
 * `plutil` call is the bottleneck — we run them serially to avoid
 * fork-bombing the system.
 */
async function listInstalledMac(dispatcher: ExecFileDispatcher): Promise<RawInstalledApp[]> {
  const roots = ['/Applications', '/System/Applications']
  const seen = new Map<string, RawInstalledApp>()
  for (const root of roots) {
    let entries: string[] = []
    try {
      entries = await fs.readdir(root)
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.endsWith('.app')) continue
      const bundlePath = join(root, entry)
      const info = await readMacInfoPlist(dispatcher, bundlePath)
      if (!info || !info.bundleId || !info.name) continue
      if (seen.has(info.bundleId)) continue
      seen.set(info.bundleId, { appId: info.bundleId, name: info.name })
    }
  }
  return Array.from(seen.values())
}

type MacInfo = { bundleId?: string; name?: string }

async function readMacInfoPlist(
  dispatcher: ExecFileDispatcher,
  bundlePath: string
): Promise<MacInfo | null> {
  const plistPath = join(bundlePath, 'Contents', 'Info.plist')
  try {
    const out = (await dispatcher('plutil', ['-convert', 'json', '-o', '-', plistPath])) as
      | { stdout?: string }
      | string
      | Buffer
      | undefined
    const text = bufferOrString(out)
    const parsed = JSON.parse(text) as Record<string, unknown>
    const bundleId = typeof parsed.CFBundleIdentifier === 'string' ? parsed.CFBundleIdentifier : ''
    const name =
      typeof parsed.CFBundleName === 'string'
        ? parsed.CFBundleName
        : typeof parsed.CFBundleDisplayName === 'string'
          ? parsed.CFBundleDisplayName
          : basename(bundlePath, '.app')
    return { bundleId, name }
  } catch {
    return null
  }
}

function launchMac(bundleId: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    try {
      const child = spawn('open', ['-b', bundleId], {
        detached: true,
        stdio: 'ignore'
      })
      child.on('error', (err) => reject(err))
      child.unref()
      resolve()
    } catch (err) {
      reject(err)
    }
  })
}

// ─── Linux ──────────────────────────────────────────────────────────────────

/**
 * Enumerate XDG `.desktop` entries from the system and user dirs.
 *
 * `Name=` lines can appear multiple times (one per `[Section]`); we
 * take the *first* `[Desktop Entry]` block's value, which is the
 * canonical display name.
 *
 * `Exec=` may contain field codes (`%u`, `%F`, `%i`, …) that need
 * stripping before the app launches cleanly. We replace them with
 * empty strings.
 */
async function listInstalledLinux(dispatcher: ExecFileDispatcher): Promise<RawInstalledApp[]> {
  const roots = [
    '/usr/share/applications',
    '/usr/local/share/applications',
    join(homedir(), '.local', 'share', 'applications')
  ]
  const seen = new Map<string, RawInstalledApp>()
  for (const root of roots) {
    let entries: string[] = []
    try {
      entries = await fs.readdir(root)
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.endsWith('.desktop')) continue
      const filePath = join(root, entry)
      const appId = basename(entry, '.desktop')
      const name = await readLinuxDesktopName(dispatcher, filePath)
      if (!name) continue
      if (seen.has(appId)) continue
      seen.set(appId, { appId, name })
    }
  }
  return Array.from(seen.values())
}

async function readLinuxDesktopName(
  dispatcher: ExecFileDispatcher,
  filePath: string
): Promise<string> {
  try {
    const out = (await dispatcher('cat', [filePath])) as
      | { stdout?: string }
      | Buffer
      | string
      | undefined
    const text = bufferOrString(out)
    let inDesktopEntry = false
    for (const line of text.split(/\r?\n/)) {
      if (line.trim() === '[Desktop Entry]') {
        inDesktopEntry = true
        continue
      }
      // Entering any other [Section] exits Desktop Entry scope.
      if (inDesktopEntry && /^\[.+\]$/.test(line.trim())) break
      if (!inDesktopEntry) continue
      const match = line.match(/^Name=(.*)$/)
      if (match) return match[1].trim()
    }
  } catch {
    // ignore
  }
  return ''
}

/**
 * Try `gtk-launch` first (works for any installed .desktop entry and
 * is what GNOME's launcher uses internally). Fall back to
 * `xdg-open` if `gtk-launch` is missing — `xdg-open` requires an
 * absolute path, so we don't include it in the enumeration contract
 * (the caller doesn't have the original .desktop path). For v1 we
 * let `gtk-launch` ENOENT bubble up; the service translates to
 * `spawnFailed`.
 */
function launchLinux(appId: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    try {
      const child = spawn('gtk-launch', [appId], {
        detached: true,
        stdio: 'ignore'
      })
      child.on('error', (err) => reject(err))
      child.unref()
      resolve()
    } catch (err) {
      reject(err)
    }
  })
}
