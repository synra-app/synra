import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import UnoCSS from '@unocss/vite'
import Vue from '@vitejs/plugin-vue'
import VueRolldown from 'unplugin-vue/rolldown'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import AutoImportRolldown from 'unplugin-auto-import/rolldown'
import ComponentsRolldown from 'unplugin-vue-components/rolldown'
import { globSync } from 'tinyglobby'
import type { UserConfig } from 'vite-plus'

function normalizeEntryPath(entry: string): string {
  return entry.replaceAll('\\', '/')
}

function toPageEntryName(pageEntryPath: string): string {
  return pageEntryPath.replace(/\.vue$/i, '')
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

const VIRTUAL_PAGES_ENTRY_NAME = '__synra_pages__'
const VIRTUAL_PAGES_ENTRY_ID = 'virtual:synra-pages-entry'
const RESOLVED_VIRTUAL_PAGES_ENTRY_ID = '\0virtual:synra-pages-entry'

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
        fileName: 'pages.json',
        source: JSON.stringify({ pages: items }, null, 2)
      })
    }
  }
}

function createVirtualPagesEntryPlugin(cwd: string, pageEntries: string[]) {
  const source = pageEntries
    .map((entry, index) => {
      const absolutePagePath = normalizeEntryPath(resolve(cwd, entry))
      const pageUrl = pathToFileURL(absolutePagePath).href
      return `import ${JSON.stringify(pageUrl)} // page-${index}`
    })
    .join('\n')

  return {
    name: 'synra-pages-entry',
    resolveId(id: string) {
      if (id === VIRTUAL_PAGES_ENTRY_ID) {
        return RESOLVED_VIRTUAL_PAGES_ENTRY_ID
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

function resolveDefaultEntries(pageEntries: string[]): Record<string, string> {
  const entries: Record<string, string> = {
    index: 'src/index.ts',
    [VIRTUAL_PAGES_ENTRY_NAME]: VIRTUAL_PAGES_ENTRY_ID
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
  const autoImportsDtsPath = normalizeEntryPath(resolve(cwd, '.auto-generated/auto-imports.d.ts'))
  const componentsDtsPath = normalizeEntryPath(resolve(cwd, '.auto-generated/components.d.ts'))
  const unoConfigPath = normalizeEntryPath(resolve(cwd, 'uno.config.ts'))
  const hasUnoConfig = existsSync(unoConfigPath)

  return {
    plugins: [
      Vue(),
      AutoImport({
        imports: ['vue'],
        dirs: ['composables'],
        dts: autoImportsDtsPath,
        vueTemplate: true
      }),
      Components({
        dirs: ['components'],
        extensions: ['vue'],
        dts: componentsDtsPath,
        deep: true
      }),
      ...(hasUnoConfig ? [UnoCSS({ configFile: unoConfigPath })] : [])
    ],
    pack: {
      entry: resolveDefaultEntries(pageEntries),
      dts: false,
      exports: {
        devExports: true
      },
      plugins: [
        VueRolldown({ isProduction: true }),
        AutoImportRolldown({
          imports: ['vue'],
          dirs: ['composables'],
          dts: autoImportsDtsPath,
          vueTemplate: true
        }),
        ComponentsRolldown({
          dirs: ['components'],
          extensions: ['vue'],
          dts: componentsDtsPath,
          deep: true
        }),
        createVirtualPagesEntryPlugin(cwd, pageEntries),
        createPagesManifestPlugin(pageManifestItems)
      ]
    }
  } as UserConfig
}
