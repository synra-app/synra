/**
 * Dev: watch main (ESM) + preload (CJS) in one process so the synra-electron plugin
 * sees a single child with esbuild watch output.
 *
 * Sandboxed preload cannot use ESM `import` (Electron docs: sandboxed preload has no ESM
 * context; use a bundler or CJS). See https://www.electronjs.org/docs/latest/tutorial/esm
 */
import type { BuildOptions } from 'esbuild'
import * as esbuild from 'esbuild'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const distSrc = join(appRoot, 'dist', 'src')

const mainBanner = [
  'import { createRequire } from "node:module";',
  'import { fileURLToPath } from "node:url";',
  'import { dirname } from "node:path";',
  'const __filename=fileURLToPath(import.meta.url);',
  'const __dirname=dirname(__filename);',
  'const require=createRequire(import.meta.url);'
].join('')

const shared: BuildOptions = {
  bundle: true,
  platform: 'node',
  minify: true,
  logLevel: 'info'
}

const mainCtx = await esbuild.context({
  ...shared,
  entryPoints: [join(appRoot, 'src', 'main.ts')],
  format: 'esm',
  outfile: join(distSrc, 'main.mjs'),
  external: ['electron', 'esbuild'],
  banner: { js: mainBanner }
})

const preloadCtx = await esbuild.context({
  ...shared,
  entryPoints: [join(appRoot, 'src', 'preload.ts')],
  format: 'cjs',
  outfile: join(distSrc, 'preload.cjs'),
  external: ['electron']
})

function fail(label: string, err: unknown): void {
  console.error(`[electron-esbuild:${label}]`, err)
  process.exit(1)
}

void mainCtx.watch().catch((err) => fail('main', err))
void preloadCtx.watch().catch((err) => fail('preload', err))
