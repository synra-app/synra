import { existsSync, readFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { dirname, relative, resolve } from 'pathe'
import { loadConfig } from '@unocss/config'
import { createGenerator } from 'unocss'
import VueRolldown from 'unplugin-vue/rolldown'
import { globSync } from 'tinyglobby'
import Vue from '@vitejs/plugin-vue'
import UnoCSS from '@unocss/vite'
import type { PluginOption, UserConfig } from 'vite-plus'
import type { UserConfig as TsdownPackUserConfig } from 'vite-plus/pack'

/** Shape passed to `pack.entry` (vp pack / tsdown). */
type TsdownPackEntry = NonNullable<TsdownPackUserConfig['entry']>
/** Per-output runtime; tsdown only supports a single top-level `pack.platform`, so we mirror it per entry for `deps.alwaysBundle`. */
type TsdownPackPlatform = NonNullable<TsdownPackUserConfig['platform']>
/** When both WebView (ESM) and Node (CJS) entries exist, split builds via tsdown `format`. */
type TsdownPackFormat = NonNullable<TsdownPackUserConfig['format']>

function normalizeEntryPath(entry: string): string {
  return entry.replaceAll('\\', '/')
}

function toPageEntryName(pageEntryPath: string): string {
  return `ui/${pageEntryPath.replace(/\.vue$/i, '')}`
}

function pluginFilePathToPagePath(filePath: string): string {
  const normalized = filePath.replaceAll('\\', '/').replace(/^\/+/, '')
  const withoutDistPrefix = normalized.replace(/^dist\//, '')
  const withoutPagesPrefix = withoutDistPrefix.replace(/^pages\//, '')
  const withoutFileSuffix = withoutPagesPrefix.replace(/\/index\.(vue|mjs)$/i, '')
  return `/${withoutFileSuffix || 'home'}`.replace(/\/+/g, '/')
}

type PagesManifestItem = {
  path: string
  file: string
}

const VIRTUAL_PAGES_ENTRY_NAME = 'ui/__synra_pages__'
const VIRTUAL_PAGES_ENTRY_ID = 'virtual:synra-pages-entry'
const RESOLVED_VIRTUAL_PAGES_ENTRY_ID = '\0virtual:synra-pages-entry'
const VIRTUAL_UNO_CSS_ID = 'virtual:uno.css'
const RESOLVED_VIRTUAL_UNO_CSS_ID = '\0virtual:uno.css'

/** Cascade layer for vp-pack CSS so host (unlayered) utilities win over identical plugin selectors. */
const SYNRA_PLUGIN_PACK_STYLE_LAYER = 'synra-plugin'
const SYNRA_RUNTIME_ENTRY_KINDS = ['ui', 'worker', 'shared', 'host'] as const
const NODE_BUILTINS = new Set(
  builtinModules.flatMap((value) => {
    return value.startsWith('node:')
      ? [value, value.slice('node:'.length)]
      : [value, `node:${value}`]
  })
)

type RuntimeEntryKind = (typeof SYNRA_RUNTIME_ENTRY_KINDS)[number]

function buildSynraPluginPackEntrySection(options: {
  cwd: string
  pageEntries: string[]
  styleEntryPath?: string
}): {
  entry: Record<string, string>
  platformByOutputKey: Record<string, TsdownPackPlatform>
} {
  const { cwd, pageEntries, styleEntryPath } = options
  const entry: Record<string, string> = {}
  const platformByOutputKey: Record<string, TsdownPackPlatform> = {}

  const add = (outputKey: string, inputPath: string, platform: TsdownPackPlatform): void => {
    entry[outputKey] = inputPath
    platformByOutputKey[outputKey] = platform
  }

  const uiMainEntry = existsSync(resolve(cwd, 'src/ui/index.ts'))
    ? 'src/ui/index.ts'
    : 'src/index.ts'
  add('ui/index', uiMainEntry, 'browser')
  add(VIRTUAL_PAGES_ENTRY_NAME, VIRTUAL_PAGES_ENTRY_ID, 'browser')

  for (const page of pageEntries) {
    add(toPageEntryName(page), page, 'browser')
  }

  if (styleEntryPath) {
    add('ui/style', styleEntryPath, 'browser')
  }

  const optionalNodeEntries: Array<{ outputKey: string; inputPath: string }> = [
    { outputKey: 'worker/index', inputPath: 'src/worker/index.ts' },
    { outputKey: 'shared/index', inputPath: 'src/shared/index.ts' },
    { outputKey: 'host/index', inputPath: 'src/host/index.ts' }
  ]
  for (const row of optionalNodeEntries) {
    if (existsSync(resolve(cwd, row.inputPath))) {
      add(row.outputKey, row.inputPath, 'node')
    }
  }

  return { entry, platformByOutputKey }
}

/**
 * Always sets top-level `pack.entry` (tsdown runs `resolveEntry` on it before applying `format` overrides).
 * When Node + browser entries both exist, adds `pack.format` so host/worker/shared emit CJS and UI emits ESM.
 *
 * @see https://tsdown.dev — `format: { esm: {...}, cjs: {...} }` with per-format `entry` + `platform`.
 */
function buildSynraPluginPackLayout(packEntrySection: {
  entry: Record<string, string>
  platformByOutputKey: Record<string, TsdownPackPlatform>
}): { entry: TsdownPackEntry; format?: TsdownPackFormat } {
  const { entry: fullEntryRecord, platformByOutputKey } = packEntrySection
  const fullEntry = fullEntryRecord as TsdownPackEntry

  const browserEntry: Record<string, string> = {}
  const nodeEntry: Record<string, string> = {}
  for (const [outputKey, inputPath] of Object.entries(fullEntryRecord)) {
    if (platformByOutputKey[outputKey] === 'node') {
      nodeEntry[outputKey] = inputPath
    } else {
      browserEntry[outputKey] = inputPath
    }
  }

  const hasBrowser = Object.keys(browserEntry).length > 0
  const hasNode = Object.keys(nodeEntry).length > 0

  if (hasBrowser && hasNode) {
    return {
      entry: fullEntry,
      format: {
        esm: {
          entry: browserEntry as TsdownPackEntry,
          platform: 'browser'
        },
        cjs: {
          entry: nodeEntry as TsdownPackEntry,
          platform: 'node'
        }
      } as TsdownPackFormat
    }
  }

  if (hasBrowser) {
    return { entry: fullEntry }
  }

  if (hasNode) {
    return {
      entry: fullEntry,
      format: {
        cjs: {
          entry: nodeEntry as TsdownPackEntry,
          platform: 'node'
        }
      } as TsdownPackFormat
    }
  }

  return { entry: fullEntry }
}

function nodeBundleDirectoryPrefixesFromPackEntry(
  entry: Record<string, string>,
  platformByOutputKey: Record<string, TsdownPackPlatform>
): string[] {
  const prefixes: string[] = []
  for (const [outputKey, inputPath] of Object.entries(entry)) {
    if (platformByOutputKey[outputKey] !== 'node') {
      continue
    }
    if (inputPath.startsWith('virtual:')) {
      continue
    }
    prefixes.push(normalizeEntryPath(dirname(inputPath)))
  }
  return prefixes
}

function shouldBundleNodeModulesForImporter(
  importer: string | undefined,
  cwd: string,
  entry: Record<string, string>,
  platformByOutputKey: Record<string, TsdownPackPlatform>
): boolean {
  if (!importer) {
    return false
  }
  const n = importer.replace(/\\/g, '/')
  if (n.includes('virtual:synra-pages-entry') || n.includes('synra-pages-entry')) {
    return true
  }
  if (/\/pages\//.test(n)) {
    return true
  }

  let rel: string
  try {
    rel = normalizeEntryPath(relative(cwd, importer))
  } catch {
    return false
  }

  if (rel.startsWith('pages/') || rel.includes('/pages/')) {
    return true
  }

  const nodeDirPrefixes = nodeBundleDirectoryPrefixesFromPackEntry(entry, platformByOutputKey)

  if (!rel.startsWith('src/')) {
    return false
  }
  for (const prefix of nodeDirPrefixes) {
    if (!prefix.startsWith('src/')) {
      continue
    }
    if (rel === prefix || rel.startsWith(`${prefix}/`)) {
      return false
    }
  }
  return true
}

function createPagesManifestItems(pageEntries: string[]): PagesManifestItem[] {
  return pageEntries.map((pageEntry) => {
    return {
      path: pluginFilePathToPagePath(pageEntry),
      file: pageEntry
    }
  })
}

/**
 * Resolves npm package name (e.g. `vue`, `@vue/runtime-core`) from a bundled module id.
 * Supports flat `node_modules` and pnpm `.pnpm/<pkg>@<ver>/node_modules/` layout.
 */
function npmPackageNameFromModuleId(moduleId: string): string | null {
  const id = moduleId.replace(/\\/g, '/')

  const pnpmStore = id.match(/\/node_modules\/\.pnpm\/([^/]+)\/node_modules\//)
  if (pnpmStore?.[1]) {
    return parsePnpmVirtualStoreFolder(pnpmStore[1])
  }

  const idx = id.indexOf('/node_modules/')
  if (idx === -1) {
    return null
  }
  const rest = id.slice(idx + '/node_modules/'.length)
  if (rest.startsWith('.pnpm/')) {
    return null
  }
  const segments = rest.split('/').filter(Boolean)
  if (segments.length === 0) {
    return null
  }
  if (segments[0].startsWith('@')) {
    return segments.length >= 2 ? `${segments[0]}/${segments[1]}` : segments[0]
  }
  return segments[0]
}

function parsePnpmVirtualStoreFolder(folder: string): string {
  const versionAt = folder.lastIndexOf('@')
  const base = versionAt === -1 ? folder : folder.slice(0, versionAt)
  if (base.startsWith('@')) {
    return `@${base.slice(1).replace(/\+/g, '/')}`
  }
  return base
}

function vendorChunkNameFromModuleId(moduleId: string): string | null {
  const pkg = npmPackageNameFromModuleId(moduleId)
  if (!pkg) {
    return null
  }
  const safe = pkg.replace(/^@/, '').replace(/\//g, '__')
  return `vendor-${safe}`
}

function createPagesManifestPlugin(items: PagesManifestItem[]) {
  return {
    name: 'synra-pages-manifest',
    generateBundle(
      this: {
        emitFile: (asset: { type: 'asset'; fileName: string; source: string }) => void
      },
      _options: unknown,
      bundle: Record<string, { fileName?: string }>
    ) {
      for (const [bundleKey, bundleValue] of Object.entries(bundle)) {
        const fileName = bundleValue.fileName ?? bundleKey
        if (fileName.includes(VIRTUAL_PAGES_ENTRY_NAME)) {
          delete bundle[bundleKey]
        }
      }
      this.emitFile({
        type: 'asset',
        fileName: 'ui/pages.json',
        source: JSON.stringify({ pages: items }, null, 2)
      })
    }
  } as UserConfig
}

function isNodeBuiltinModule(input: string): boolean {
  if (input.startsWith('node:')) {
    return NODE_BUILTINS.has(input)
  }
  return NODE_BUILTINS.has(input)
}

function createRuntimeBoundaryCheckPlugin(cwd: string) {
  const normalizedRoot = normalizeEntryPath(`${cwd}/`)
  const runtimeKinds = new Set<RuntimeEntryKind>(['ui', 'worker', 'shared'])
  return {
    name: 'synra-runtime-boundary-check',
    resolveId(source: string, importer?: string) {
      if (!importer || !isNodeBuiltinModule(source)) {
        return null
      }
      const normalizedImporter = normalizeEntryPath(importer)
      if (!normalizedImporter.startsWith(normalizedRoot)) {
        return null
      }
      const relativeImporter = normalizedImporter.slice(normalizedRoot.length)
      const segments = relativeImporter.split('/')
      const runtimeSegment =
        segments[0] === 'src' && typeof segments[1] === 'string'
          ? (segments[1] as RuntimeEntryKind)
          : (segments[0] as RuntimeEntryKind)
      if (!runtimeKinds.has(runtimeSegment)) {
        return null
      }
      throw new Error(
        `Entry '${runtimeSegment}' cannot import Node.js built-in module '${source}'. Move this logic to src/host/index.ts.`
      )
    }
  }
}

function createVirtualPagesEntryPlugin(cwd: string, pageEntries: string[], hasUnoConfig: boolean) {
  const imports = [
    ...(hasUnoConfig ? [`import ${JSON.stringify(VIRTUAL_UNO_CSS_ID)}`] : []),
    ...pageEntries.map((entry, index) => {
      const relativeImportPath = `./${entry.replace(/^\.?\//, '')}`
      return `import ${JSON.stringify(relativeImportPath)} // page-${index}`
    })
  ]

  const source = imports.join('\n')

  return {
    name: 'synra-pages-entry',
    resolveId(id: string) {
      if (id === VIRTUAL_PAGES_ENTRY_ID) {
        return RESOLVED_VIRTUAL_PAGES_ENTRY_ID
      }
      if (id.startsWith('./pages/')) {
        return normalizeEntryPath(resolve(cwd, id.slice(2)))
      }
      return null
    },
    load(id: string) {
      if (id === RESOLVED_VIRTUAL_PAGES_ENTRY_ID) {
        return `${source}\n`
      }
      return null
    }
  }
}

function createUnoCssGeneratePlugin(cwd: string, hasUnoConfig: boolean, unoConfigPath: string) {
  if (!hasUnoConfig) {
    return {
      name: 'synra-unocss-generate',
      resolveId() {
        return null
      },
      load() {
        return null
      }
    }
  }

  let generatedCss: string | null = null

  function compressCss(css: string): string {
    return css
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\s+/g, ' ')
      .replace(/\s*([{}:;,])\s*/g, '$1')
      .replace(/;}/g, '}')
      .trim()
  }

  async function ensureGeneratedCss(): Promise<string> {
    if (generatedCss !== null) {
      return generatedCss
    }

    const scanTargets = globSync(
      [
        'components/**/*.{vue,ts,js,tsx,jsx}',
        'pages/**/*.{vue,ts,js,tsx,jsx}',
        'composables/**/*.{vue,ts,js,tsx,jsx}',
        'src/**/*.{vue,ts,js,tsx,jsx}'
      ],
      {
        cwd,
        onlyFiles: true,
        ignore: ['node_modules/**', 'dist/**', '.auto-generated/**']
      }
    )
    const mergedSource = scanTargets
      .map((relativePath) => readFileSync(resolve(cwd, relativePath), 'utf8'))
      .join('\n')
    const loaded = await loadConfig(cwd, unoConfigPath)
    const generator = await createGenerator(loaded.config ?? {})
    const result = await generator.generate(mergedSource, { minify: true })

    const compressed = compressCss(result.css)
    generatedCss = `@layer ${SYNRA_PLUGIN_PACK_STYLE_LAYER}{${compressed}}`
    return generatedCss
  }

  return {
    name: 'synra-unocss-generate',
    async resolveId(id: string) {
      if (id === VIRTUAL_UNO_CSS_ID) {
        return RESOLVED_VIRTUAL_UNO_CSS_ID
      }
      return null
    },
    async load(id: string) {
      if (id === RESOLVED_VIRTUAL_UNO_CSS_ID) {
        return await ensureGeneratedCss()
      }
      return null
    },
    async buildStart() {
      await ensureGeneratedCss()
    }
  }
}

/**
 * v3 single-bundle plugin vite config helper.
 *
 * The chat plugin at `D:/Projects/synra-plugin-chat` uses the v3 contract:
 * a single `src/index.ts` → `dist/synra/index.js` bundle, no `pages.json`,
 * no pages enumeration, no dist/ui outputs.
 *
 * v3 design note — `vue` is treated as EXTERNAL on purpose. The plugin
 * bundle ships `import { defineComponent, inject, ... } from 'vue'` as a
 * bare specifier, and the host resolves it via an importmap at page load
 * time. This guarantees the plugin and the host share a single Vue
 * runtime instance, so `provide` / `inject` cross the host→plugin
 * component boundary correctly. Inlining Vue into the plugin bundle (the
 * old `alwaysBundle: every-regex` strategy) gave the plugin its own Vue
 * instance — `provide(SYNRA_BRIDGE_KEY, ...)` in the host became invisible
 * to plugin components, and host patches of the plugin subtree crashed
 * with `Cannot read properties of null (reading 'refs')`.
 *
 * Other runtime deps are still always-inlined so the bundle ships zero
 * bare specifiers (Android WebView has no node_modules to resolve from).
 *
 * Use `defineConfig()` from chat plugin's `vite.config.ts` for the v3 path.
 *
 * @see ai-docs/plugin-system/05-build-and-bundle.md
 * @see ai-docs/plugin-system/09-runtime-redesign.md
 */
export function defineConfig(options: { outDir?: string } = {}): UserConfig {
  const cwd = process.cwd()
  const entry = resolve(cwd, 'src/index.ts')
  const unoConfigPath = resolve(cwd, 'uno.config.ts')
  const hasUnoConfig = existsSync(unoConfigPath)

  const plugins = [
    Vue(),
    ...(hasUnoConfig ? [UnoCSS({ configFile: unoConfigPath })] : [])
  ] as unknown as UserConfig['plugins']

  return {
    build: {
      minify: true,
      target: 'es2022'
    },
    fmt: {
      singleQuote: true,
      semi: false,
      trailingComma: 'none'
    },
    plugins,
    pack: {
      entry: { 'synra/index': entry },
      outDir: options.outDir ?? resolve(cwd, 'dist'),
      format: 'esm',
      platform: 'browser',
      dts: false,
      minify: true,
      sourcemap: false,
      clean: true,
      treeshake: true,
      css: { minify: true },
      exports: { devExports: true },
      /**
       * Force a single-file bundle. The host loader is chunk-aware (it
       * walks sibling `dist-*.js` / `web-*.js` / `electron-*.js` chunks
       * and rewrites each relative import into the dep's blob URL), but
       * the v3 contract is a single `dist/synra/index.js` — any plugin
       * whose dynamic `import(...)` calls produce a chunk graph forces
       * the host to spin up one blob per chunk and rewrite relative
       * paths on every page mount, which the loader does support but
       * the v3 helper doesn't want. `codeSplitting: false` inlines every
       * dynamic import into the entry (equivalent to the deprecated
       * `inlineDynamicImports: true`); the single-entry shape is a
       * documented requirement of that flag.
       */
      outputOptions: {
        codeSplitting: false
      },
      deps: {
        // Force-inline every node_modules dep EXCEPT `vue`. `vue` stays
        // as a bare specifier so the host's importmap can redirect
        // `import ... from 'vue'` to its own Vue runtime chunk. Without
        // this, the plugin gets its own Vue instance — `provide` /
        // `inject` cross the host→plugin boundary fails, and Android
        // WebView patches crash with `Cannot read properties of null`.
        // Everything else is inlined so the bundle works in Android
        // WebView / file:// / custom protocols without a node_modules
        // tree to resolve from.
        alwaysBundle: [/^(?!vue$).+/]
      },
      plugins: [VueRolldown({ isProduction: true })]
    } as TsdownPackUserConfig
  } as unknown as UserConfig
}

export function synraVitePluginConfig(): UserConfig {
  const cwd = process.cwd()
  const pagesPattern = 'pages/**/index.vue'
  const pageEntries = globSync(pagesPattern, { cwd, onlyFiles: true }).map(normalizeEntryPath)
  const packEntrySection = buildSynraPluginPackEntrySection({ cwd, pageEntries })
  const packLayout = buildSynraPluginPackLayout(packEntrySection)
  const pageManifestItems = createPagesManifestItems(pageEntries)
  const unoConfigPath = normalizeEntryPath(resolve(cwd, 'uno.config.ts'))
  const hasUnoConfig = existsSync(unoConfigPath)

  return {
    build: {
      minify: true
    },
    fmt: {
      singleQuote: true,
      semi: false,
      trailingComma: 'none'
    },
    plugins: [
      Vue() as unknown as PluginOption,
      hasUnoConfig ? UnoCSS({ configFile: unoConfigPath }) : null
    ],
    pack: {
      entry: packLayout.entry,
      ...(packLayout.format ? { format: packLayout.format } : {}),
      dts: false,
      minify: true,
      css: {
        minify: true
      },
      exports: {
        devExports: true
      },
      deps: {
        alwaysBundle: (_id: string, importer?: string) =>
          shouldBundleNodeModulesForImporter(
            importer,
            cwd,
            packEntrySection.entry,
            packEntrySection.platformByOutputKey
          ),
        onlyBundle: false
      },
      /**
       * Split inlined `node_modules` into per-package chunks (Rolldown manual code splitting).
       * @see https://rolldown.rs/in-depth/manual-code-splitting
       */
      outputOptions: {
        codeSplitting: {
          groups: [
            {
              test: /node_modules[\\/]/,
              name: (moduleId: string) => vendorChunkNameFromModuleId(moduleId)
            }
          ]
        }
      },
      plugins: [
        VueRolldown({ isProduction: true }),
        createRuntimeBoundaryCheckPlugin(cwd),
        createUnoCssGeneratePlugin(cwd, hasUnoConfig, unoConfigPath),
        createVirtualPagesEntryPlugin(cwd, pageEntries, hasUnoConfig),
        createPagesManifestPlugin(pageManifestItems)
      ]
    } as TsdownPackUserConfig
  }
}
