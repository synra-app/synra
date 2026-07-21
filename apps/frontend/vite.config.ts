import { execSync } from 'node:child_process'
import { homedir } from 'node:os'
import { dirname, join, resolve as pathResolve } from 'pathe'
import { fileURLToPath } from 'node:url'
import UnoCSS from '@unocss/vite'
import Vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import type { Plugin } from 'vite'
import { defineConfig, type UserConfig } from 'vite-plus'
import VueRouter from 'vue-router/vite'
import { loadAppConfig } from '../../scripts/config/app-config'
const __dirname = dirname(fileURLToPath(import.meta.url))
const r = (p: string) => pathResolve(__dirname, p)
const projectRoot = __dirname
const workspaceRoot = pathResolve(__dirname, '../..')
const synraPluginsRoot = join(homedir(), '.synra', 'plugins')
const appConfig = loadAppConfig(import.meta.url)

function getGitSha(): string {
  try {
    return execSync('git rev-parse --short HEAD', {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'ignore']
    })
      .toString()
      .trim()
  } catch {
    return 'unknown'
  }
}

const buildMeta = {
  appName: appConfig.appName,
  appVersion: appConfig.appVersion,
  buildTime: new Date().toISOString(),
  gitSha: getGitSha()
}

/** Resolve @synra/* from the app/node_modules when importing from ~/.synra/plugins (Vite /@fs/ analysis). */
function synraInstalledPluginWorkspaceResolve(options: { projectRoot: string }): Plugin {
  const synraPluginsSegment = '/.synra/plugins/'

  function touchesInstalledSynraPlugin(importer: string): boolean {
    const n = importer.replace(/\\/g, '/')
    return n.includes(synraPluginsSegment) || (n.includes('/@fs/') && n.includes('.synra/plugins'))
  }

  return {
    name: 'synra-installed-plugin-workspace-resolve',
    enforce: 'pre',
    async resolveId(id, importer, resolveOpts) {
      if (!importer || !id.startsWith('@synra/')) {
        return null
      }
      if (!touchesInstalledSynraPlugin(importer)) {
        return null
      }
      const resolved = await this.resolve(id, join(options.projectRoot, 'package.json'), {
        skipSelf: true,
        ...resolveOpts
      })
      return resolved ?? null
    }
  }
}

const plugins: any[] = []
plugins.push(synraInstalledPluginWorkspaceResolve({ projectRoot }))
plugins.push(VueRouter({ dts: r('.auto-generated/typed-router.d.ts') }))
plugins.push(Vue())
plugins.push(
  AutoImport({
    imports: ['vue', 'vue-router', 'pinia'],
    dirs: [r('src/composables')],
    dts: r('.auto-generated/auto-imports.d.ts'),
    vueTemplate: true
  })
)
plugins.push(
  Components({
    dirs: [r('src/components')],
    extensions: ['vue'],
    dts: r('.auto-generated/components.d.ts'),
    deep: true
  })
)
plugins.push(
  UnoCSS({
    configFile: r('uno.config.ts')
  })
)

// v3 plugin contract — keep Vue in a stable, named chunk so the host can
// publish an importmap entry that lets every plugin bundle resolve
// `import ... from 'vue'` to THIS exact chunk. Without this, the plugin's
// `alwaysBundle: [/.*/]` strategy inlines its own Vue runtime copy and
// `provide` / `inject` cross the host→plugin boundary fails (the Android
// WebView patch path crashes with `Cannot read properties of null`).
//
// `manualChunks` here steers every `@vue/*` (and the `vue` facade) into a
// single chunk named `vendor-vue`. The companion `synraVueImportmap`
// plugin scans the generated bundle for that chunk's actual filename and
// emits a `<script type="importmap">` so plugin bundles can resolve
// `import ... from 'vue'` to the same chunk.
function synraVueVendorChunk(): Plugin {
  return {
    name: 'synra-vue-vendor-chunk',
    enforce: 'post',
    outputOptions(outputOptions) {
      const existing = outputOptions.manualChunks
      const merged: NonNullable<typeof existing> =
        typeof existing === 'function'
          ? (id, meta) => {
              if (isVueModuleId(id)) return 'vendor-vue'
              if (typeof existing === 'function') return existing(id, meta)
              return undefined as never
            }
          : (id) => (isVueModuleId(id) ? 'vendor-vue' : undefined)
      return { ...outputOptions, manualChunks: merged }
    }
  }
}

function isVueModuleId(id: string): boolean {
  const n = id.replace(/\\/g, '/')
  return (
    n.includes('/node_modules/vue/') ||
    n.includes('/node_modules/@vue/') ||
    /\/node_modules\/\.pnpm\/(vue|@vue[^/]+)@/.test(n)
  )
}

// Scan the generated bundle for the `vendor-vue` chunk and inject a
// `<script type="importmap">` into the emitted `index.html` so plugin
// bundles can `import ... from 'vue'` and share the host's Vue runtime.
//
// `renderChunk` is also used here to forcibly expose the Vue helper
// names that plugin bundles import by their PUBLIC names but Rollup
// collapses back to the IMPLEMENTATION names. Concretely:
// `createElementVNode` is implemented in `@vue/runtime-core` as
// `createBaseVNode` and exposed via the `createBaseVNode as
// createElementVNode` alias. When the host's tree-shake pass runs,
// Rollup traces the alias back to `createBaseVNode` and emits
// `Os as createBaseVNode` in the vendor-vue chunk's export block —
// not `createElementVNode`. The chat plugin's compiled render code
// imports `createElementVNode` by name; that resolves to `undefined`
// and crashes deep inside Vue's setRef with
// `TypeError: Cannot read properties of null (reading 'refs')`.
// Here we re-append the alias to the chunk's `export { ... }` block
// using the same internal binding (`Os`), so the chunk now exposes
// the public name AND the implementation name. Importing either name
// resolves to the same function.
function synraVueImportmap(outDir: string): Plugin {
  let vueChunkFileName: string | null = null
  return {
    name: 'synra-vue-importmap',
    apply: 'build',
    generateBundle(_options, bundle) {
      for (const asset of Object.values(bundle)) {
        if (asset.type === 'chunk' && asset.name === 'vendor-vue') {
          vueChunkFileName = `/${asset.fileName.replace(/^\/+/, '')}`
        }
      }
    },
    async closeBundle() {
      const fs = await import('node:fs/promises')
      const path = await import('node:path')

      // 1) Post-process the vendor-vue chunk on disk to append the
      //    `createElementVNode` public alias onto the chunk's export
      //    block. See the file-level comment on `synraVueImportmap`
      //    for context. Rollup's tree-shake collapses the
      //    `createBaseVNode as createElementVNode` alias back to the
      //    implementation name; we re-add the public name on disk so
      //    plugin bundles can resolve it.
      if (vueChunkFileName) {
        const chunkFull = path.join(outDir, vueChunkFileName.replace(/^\/+/, ''))
        let code = await fs.readFile(chunkFull, 'utf8')
        const existing = /Os\s+as\s+createBaseVNode(\s*,)/
        if (existing.test(code) && !/Os\s+as\s+createElementVNode/.test(code)) {
          code = code.replace(
            existing,
            (_m, sep) => `Os as createBaseVNode${sep}Os as createElementVNode${sep}`
          )
        }
        await fs.writeFile(chunkFull, code, 'utf8')
      }

      // 2) Inject the importmap into every emitted HTML.
      if (!vueChunkFileName) return
      const importMapScript = `<script type="importmap">${JSON.stringify({
        vue: vueChunkFileName
      })}</script>`
      const entries = await fs.readdir(outDir)
      for (const entry of entries) {
        if (!entry.endsWith('.html')) continue
        const fullPath = path.join(outDir, entry)
        const original = await fs.readFile(fullPath, 'utf8')
        if (original.includes('type="importmap"')) continue
        const next = original.replace(/<head>/, `<head>${importMapScript}`)
        await fs.writeFile(fullPath, next, 'utf8')
      }
    }
  }
}

export default defineConfig({
  build: {
    minify: true,
    rollupOptions: {
      output: {
        // v3 plugin contract — keep named exports of vue's runtime
        // (e.g. `mergeModels`, `useModel`, `vModelText`, `withKeys`) at
        // their original names so plugin bundles can resolve
        // `import { ... } from 'vue'` through the host's importmap.
        // Rollup's default `es`/`system` minifier renames internal
        // exports to single letters, which silently returns `undefined`
        // for every plugin helper and surfaces as
        // `TypeError: Cannot read properties of null (reading 'refs')`
        // on Android when a plugin mounts a `v-model`/`@click` template.
        minifyInternalExports: false
      }
    }
  },
  // v3 plugin contract — alias `vue` to the WITH-COMPILER build, not
  // the runtime-only one Vite resolves by default. Plugin bundles
  // compiled from `.vue` SFCs import compiler helpers by their public
  // name (e.g. `createElementVNode`, `Transition`,
  // `createElementBlock`) — those ONLY exist in
  // `vue/dist/vue.esm-bundler.js`, not in
  // `vue/dist/vue.runtime.esm-bundler.js`. With the runtime-only
  // build, the plugin's compiled render functions land on `undefined`
  // helpers and crash deep inside Vue's setRef with
  // `Cannot read properties of null (reading 'refs')` when the host
  // mounts the plugin subtree on Android.
  resolve: {
    alias: {
      vue: 'vue/dist/vue.esm-bundler.js'
    }
  },
  define: {
    __APP_NAME__: JSON.stringify(buildMeta.appName),
    __APP_VERSION__: JSON.stringify(buildMeta.appVersion),
    __APP_BUILD_TIME__: JSON.stringify(buildMeta.buildTime),
    __APP_GIT_SHA__: JSON.stringify(buildMeta.gitSha)
  },
  server: {
    fs: {
      allow: [workspaceRoot, synraPluginsRoot]
    }
  },
  plugins: [...plugins, synraVueVendorChunk(), synraVueImportmap(r('dist'))]
} as UserConfig)
