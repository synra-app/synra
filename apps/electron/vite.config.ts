import { resolve } from 'pathe'
import { defineConfig } from 'vite-plus'
import { synraElectronPlugin } from 'vite-plugin-synra-electron'

const workspaceRoot = resolve(__dirname, '../..')
const capacitorElectronDistEntry = resolve(
  workspaceRoot,
  'packages/capacitor-electron/dist/index.mjs'
)
const capacitorElectronCwd = resolve(workspaceRoot, 'packages/capacitor-electron')
const electronDistMainEntry = resolve(__dirname, 'dist/src/main.mjs')
const electronDistPreloadEntry = resolve(__dirname, 'dist/src/preload.cjs')

export default defineConfig({
  server: {
    port: 5176,
    strictPort: true
  },
  pack: {
    format: ['esm'],
    minify: true
  },
  plugins: [
    synraElectronPlugin({
      workspaceRoot,
      electronCwd: __dirname,
      frontendDevUrl: 'http://localhost:5173',
      prebuildCommand: {
        command: 'vp',
        args: [
          'exec',
          'esbuild',
          'src/index.ts',
          '--bundle',
          '--platform=node',
          '--format=esm',
          '--outfile=dist/index.mjs'
        ],
        cwd: capacitorElectronCwd
      },
      electronBuildCommand: {
        command: 'vp',
        args: ['exec', 'esno', 'scripts/electron-esbuild-watch.ts'],
        cwd: __dirname
      },
      electronRuntimeCommand: {
        command: 'vp',
        args: ['exec', 'electron', './dist/src/main.mjs'],
        cwd: __dirname,
        env: { VITE_DEV_SERVER_URL: 'http://localhost:5173' }
      },
      startFrontendDevServer: true,
      frontendDevCommand: {
        command: 'vp',
        args: ['run', 'frontend#dev:electron'],
        cwd: workspaceRoot
      },
      waitForPaths: [capacitorElectronDistEntry, electronDistMainEntry, electronDistPreloadEntry]
    })
  ]
})
