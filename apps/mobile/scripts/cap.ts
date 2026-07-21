import { access, mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { resolve } from 'pathe'
import { build } from 'esbuild'
import { spawn } from 'node:child_process'

const mobileDir = resolve(import.meta.dirname, '..')
const webDir = resolve(mobileDir, 'www')
const indexFile = resolve(webDir, 'index.html')
const tsConfigPath = resolve(mobileDir, 'capacitor.config.ts')
const cjsConfigPath = resolve(mobileDir, 'capacitor.config.cjs')
const stashConfigPath = resolve(mobileDir, 'capacitor.config.ts.stash')

async function ensureCapacitorWebEntry(): Promise<void> {
  try {
    await access(indexFile, constants.F_OK)
    return
  } catch {
    await mkdir(webDir, { recursive: true })
    await writeFile(
      indexFile,
      '<!doctype html><html><head><meta charset="UTF-8" /><title>Synra</title></head><body></body></html>\n',
      'utf8'
    )
    console.log('[cap] Created fallback web entry at apps/mobile/www/index.html')
  }
}

/**
 * `@capacitor/cli@8` ships `loadExtConfigTS` which calls
 * `ts.transpileModule(...)` to compile the user's `capacitor.config.ts`
 * in-memory. Under TypeScript 7 (the Go rewrite), the public compiler
 * API was removed: `package.json#exports['.']` only exposes `version`.
 * Capacitor's call dies with `Cannot read properties of undefined
 * (reading 'CommonJS')` before the `require.extensions['.ts']` hook
 * fires.
 *
 * Workaround: pre-compile `capacitor.config.ts` → `capacitor.config.cjs`
 * via esbuild, stash the `.ts` so Capacitor's `.ts`-preferred lookup
 * falls through to the `.cjs`, run `cap …` against the `.cjs`, then
 * restore the `.ts` and delete the `.cjs`. The `.ts` source remains
 * canonical for editing and VCS.
 *
 * @see memory/capacitor-config-ts-vs-ts7.md
 */
async function compileAndStashCapConfig(): Promise<() => Promise<void>> {
  await build({
    entryPoints: [tsConfigPath],
    outfile: cjsConfigPath,
    bundle: false,
    format: 'cjs',
    platform: 'node',
    target: 'node18',
    logLevel: 'silent'
  })
  await rename(tsConfigPath, stashConfigPath)
  console.log('[cap] Stashed capacitor.config.ts → .ts.stash (using compiled .cjs)')
  return async () => {
    await rename(stashConfigPath, tsConfigPath)
    await rm(cjsConfigPath, { force: true })
    console.log('[cap] Restored capacitor.config.ts and removed .cjs')
  }
}

async function runCapacitor(args: string[]): Promise<number> {
  const vpCommand = process.platform === 'win32' ? 'vp.cmd' : 'vp'

  const restoreConfig = await compileAndStashCapConfig()

  try {
    return await new Promise<number>((resolveExitCode, reject) => {
      // shell: true required on Windows when spawning `.cmd` shims under
      // Node 24 — without it, spawn throws EINVAL because Windows blocks
      // direct execution of cmd-bat wrappers without an explicit shell.
      const child = spawn(vpCommand, ['exec', 'cap', ...args], {
        cwd: mobileDir,
        stdio: 'inherit',
        shell: process.platform === 'win32'
      })
      child.on('error', reject)
      child.on('exit', (code) => resolveExitCode(code ?? 1))
    })
  } finally {
    await restoreConfig()
  }
}

const args = process.argv.slice(2)

await ensureCapacitorWebEntry()
const exitCode = await runCapacitor(args)
process.exit(exitCode)
