import { existsSync, readFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { resolve } from 'pathe'
import { loadConfig } from '@unocss/config'
import { createGenerator } from 'unocss'
import VueRolldown from 'unplugin-vue/rolldown'
import { globSync } from 'tinyglobby'
import Vue from '@vitejs/plugin-vue'
import UnoCSS from '@unocss/vite'
import type { PluginOption, UserConfig } from 'vite-plus'

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

function createPagesManifestItems(pageEntries: string[]): PagesManifestItem[] {
  return pageEntries.map((pageEntry) => {
    return {
      path: pluginFilePathToPagePath(pageEntry),
      file: pageEntry
    }
  })
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

function resolveDefaultEntries(
  pageEntries: string[],
  styleEntryPath?: string
): Record<string, string> {
  const entries: Record<string, string> = {
    'ui/index': existsSync(resolve(process.cwd(), 'src/ui/index.ts'))
      ? 'src/ui/index.ts'
      : 'src/index.ts',
    [VIRTUAL_PAGES_ENTRY_NAME]: VIRTUAL_PAGES_ENTRY_ID
  }

  const runtimeOptionalEntries: Array<{ kind: RuntimeEntryKind; entryPath: string }> = [
    { kind: 'worker', entryPath: 'src/worker/index.ts' },
    { kind: 'shared', entryPath: 'src/shared/index.ts' },
    { kind: 'host', entryPath: 'src/host/index.ts' }
  ]

  for (const entry of runtimeOptionalEntries) {
    if (existsSync(resolve(process.cwd(), entry.entryPath))) {
      entries[`${entry.kind}/index`] = entry.entryPath
    }
  }

  if (styleEntryPath) {
    entries['ui/style'] = styleEntryPath
  }

  for (const pageEntry of pageEntries) {
    entries[toPageEntryName(pageEntry)] = pageEntry
  }

  return entries
}

export function synraVitePluginConfig(): UserConfig {
  const cwd = process.cwd()
  const pagesPattern = 'pages/**/index.vue'
  const pageEntries = globSync(pagesPattern, { cwd, onlyFiles: true }).map(normalizeEntryPath)
  const pageManifestItems = createPagesManifestItems(pageEntries)
  const unoConfigPath = normalizeEntryPath(resolve(cwd, 'uno.config.ts'))
  const hasUnoConfig = existsSync(unoConfigPath)

  return {
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
      entry: resolveDefaultEntries(pageEntries),
      dts: false,
      css: {
        minify: true
      },
      exports: {
        devExports: true
      },
      plugins: [
        VueRolldown({ isProduction: true }),
        createRuntimeBoundaryCheckPlugin(cwd),
        createUnoCssGeneratePlugin(cwd, hasUnoConfig, unoConfigPath),
        createVirtualPagesEntryPlugin(cwd, pageEntries, hasUnoConfig),
        createPagesManifestPlugin(pageManifestItems)
      ] as any
    }
  }
}
