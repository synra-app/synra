import { SYNRA_BRIDGE_KEY, type PluginBridge, normalizePluginPagePath } from '@synra/plugin-sdk'
import { dirname, join } from 'pathe'
import { defineComponent, h, provide, ref, type Component } from 'vue'
import type { Router } from 'vue-router'
import { tryGetSynraPluginRuntimeBridge } from '../bridge/synra-plugin-host-bridge'
import type { PagesManifest, RegisteredPage } from './types'

/**
 * v3 plugin bundles normally ship a single ESM module (`dist/synra/index.js`),
 * but the v2-bundler pipeline (Rolldown manual code-splitting) and any plugin
 * whose `pack.output.codeSplitting` is left enabled will emit a chunked
 * graph: an entry + a few sibling `dist-*.js` / `web-*.js` / `electron-*.js`
 * files. Their sources reference both bare specifiers (`import ... from 'vue'`)
 * AND relative specifiers (`import "../dist-BrPzbUTp.js"`).
 *
 * The host exposes the Vue runtime via `<script type="importmap">` so static
 * `<script type="module">` resolves it, but per the HTML module-loader spec
 * `import()` does NOT inherit the document importmap. Without rewriting,
 * a plugin bundle's `import 'vue'` falls through to "Failed to resolve
 * module specifier" on every platform.
 *
 * The fix is uniform across Electron and Capacitor:
 *   1. Read each chunk's source through the host bridge (`bridge.readFile`).
 *      `synra-plugin://` custom scheme looked tempting but `fetch()` from
 *      a renderer against a custom scheme is unreliable across Chromium
 *      versions (returns HTML error pages instead of the file body, hence
 *      the "Unexpected token '<'" we kept seeing). `bridge.readFile` is
 *      the IPC path the host already uses for `pages.json`, so we reuse
 *      it — Electron renderer → preload IPC → `file.read`, Capacitor
 *      native → `@capacitor/filesystem`.
 *   2. Walk the chunk graph recursively. For each chunk:
 *      a) Replace bare specifiers (`vue`, `@synra/plugin-sdk`, …) with the
 *         absolute URL from the document importmap.
 *      b) Replace relative specifiers (`./foo.js`, `../dist-*.js`, even
 *         dynamic `import("../web-*.js")` calls) with the dependency
 *         chunk's blob URL — this preserves lazy semantics while letting
 *         the blob-URL loader resolve nested chunks without hitting the
 *         network.
 *   3. Hand the entry's rewritten bytes to a blob URL and `import()` the
 *      blob. The blob's opaque base URL is fine because every remaining
 *      specifier is already an absolute URL (host asset) or a sibling
 *      blob URL (chunk dep).
 */
function readSynraDocumentImportMap(): Record<string, string> {
  if (typeof document === 'undefined') return {}
  const cached = (window as { __synraImportMap?: Record<string, string> }).__synraImportMap
  if (cached) return cached
  const node = document.querySelector('script[type="importmap"]')
  if (!node || !node.textContent) {
    // No <script type="importmap"> in the document. That happens in
    // `vite dev` mode because `synraVueImportmap` is gated on
    // `apply: 'build'`, so the importmap is only injected during
    // `vite build`. Without any rewrite target the importmap pass
    // falls through and the plugin bundle's `import 'vue'` reaches
    // Chromium verbatim — which then throws
    // "Failed to resolve module specifier 'vue'".
    //
    // The vite dev server already pre-builds `vue` to
    // `node_modules/.vite/deps/vue.js` (it shows up in
    // `apps/frontend/node_modules/.vite/deps/` and the file exposes
    // the same `createBaseVNode as createElementVNode` alias the
    // build-mode vendor-vue chunk exposes). So we synthesize an
    // in-memory map that lets the rewrite point `vue` at that
    // prebuilt chunk. This map is never written into the DOM as a
    // `<script type="importmap">` — the document importmap, if
    // present, is what static `<script type="module">` would
    // consume. We only use it to drive the source-text rewrite
    // before the blob URL is handed to `import()`, so we don't
    // need it on the document.
    if (import.meta.env?.DEV) {
      const devFallback: Record<string, string> = {
        vue: '/node_modules/.vite/deps/vue.js'
      }
      ;(window as { __synraImportMap?: Record<string, string> }).__synraImportMap = devFallback
      return devFallback
    }
    ;(window as { __synraImportMap?: Record<string, string> }).__synraImportMap = {}
    return {}
  }
  let parsed: Record<string, string> = {}
  try {
    parsed = JSON.parse(node.textContent) as Record<string, string>
  } catch {
    parsed = {}
  }
  ;(window as { __synraImportMap?: Record<string, string> }).__synraImportMap = parsed
  return parsed
}

// v3 plugin bundles ship minified output where `import ... from "vue"` may
// have zero whitespace between `from` and the opening quote. The binding
// list (`{computed as e, ...}`) is captured into group 2 so the rewrite
// preserves it verbatim — without that, the previous attempt at the fix
// silently dropped the binding list and Chromium then couldn't resolve
// any of `computed` / `defineComponent` / `h` / `inject` / `ref`.
// The character class `[^"'`;\n]` for the binding list excludes every
// quote flavour, so it can never bleed across the source string and
// consume the specifier by mistake.
const FROM_CLAUSE_RE = /\b(import|export)([^"'`;\n]*?)\s*\bfrom\s*([`'"])([^`'"]+?)\3/g
const SIDE_EFFECT_IMPORT_RE = /\b(import)(\s*)([`'"])([^`'"]+?)\3/g

/**
 * Relative-import forms. Each variant captures the specifier (group 2 for
 * from-clauses, group 4 for side-effect, group 2 for dynamic `import(...)`)
 * starting with `./` or `../`. We need a dedicated sweep before the
 * importmap rewrite because the importmap only knows about bare specifiers
 * (`vue`, `@synra/plugin-sdk`, etc.); relative paths fall through unchanged
 * and the blob-URL base is opaque, so the loader has to redirect them to
 * other chunk blobs instead. Without this sweep Chromium throws
 * "Failed to resolve module specifier '../dist-BrPzbUTp.js'" because the
 * relative path would be resolved against `blob:https://localhost/<uuid>`.
 */
const RELATIVE_FROM_RE = /\b(import|export)([^"'`;\n]*?)\s*\bfrom\s*([`'"])(\.\.?\/[^`'"]+?)\3/g
const RELATIVE_SIDE_RE = /\b(import)(\s*)([`'"])(\.\.?\/[^`'"]+?)\3/g
const RELATIVE_DYN_RE = /\bimport\s*\(\s*([`'"])(\.\.?\/[^`'"]+?)\1\s*\)/g

function rewriteBareSpecifiers(
  source: string,
  importMap: Record<string, string>,
  baseUrl: string
): string {
  if (!source || Object.keys(importMap).length === 0) return source

  const resolveFromClause = (
    match: string,
    head: string,
    binding: string,
    quote: string,
    specifier: string
  ): string => {
    const resolved = importMap[specifier]
    if (!resolved) return match
    let absolute: string
    try {
      absolute = new URL(resolved, baseUrl).href
    } catch {
      return match
    }
    return `${head}${binding}from${quote}${absolute}${quote}`
  }

  const resolveSideEffect = (
    match: string,
    head: string,
    ws: string,
    quote: string,
    specifier: string
  ): string => {
    const resolved = importMap[specifier]
    if (!resolved) return match
    let absolute: string
    try {
      absolute = new URL(resolved, baseUrl).href
    } catch {
      return match
    }
    return `${head}${ws}${quote}${absolute}${quote}`
  }

  // from-clause pass: `import ... from "spec"` and `export ... from "spec"`.
  let rewritten = source.replace(FROM_CLAUSE_RE, resolveFromClause)

  // side-effect pass: `import "spec"` / `import 'spec'` — no `from` keyword.
  // Run after from-clause so we never double-rewrite an already-converted
  // absolute URL (which would now start with a quote but is no longer bare).
  rewritten = rewritten.replace(SIDE_EFFECT_IMPORT_RE, resolveSideEffect)

  return rewritten
}

/**
 * Resolve `./foo` / `../bar` against a POSIX directory path. Pure-string,
 * no filesystem access. Parts that resolve to an empty dir return the
 * spec literally (e.g. `dist/synra/../dist-BrPzbUTp.js` → `dist/dist-BrPzbUTp.js`).
 */
function resolveRelativeImport(fromDir: string, spec: string): string {
  const parts = fromDir.split('/').filter((segment) => segment.length > 0)
  for (const segment of spec.split('/')) {
    if (segment === '..') {
      parts.pop()
    } else if (segment !== '.' && segment.length > 0) {
      parts.push(segment)
    }
  }
  return parts.join('/')
}

function escapeRegexLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Read plugin bundle source via the host bridge — the same path the
 * loader already uses for `pages.json`. Returns the file as a UTF-8
 * string. Both Capacitor native (`Filesystem.readFile`) and Electron
 * renderer (preload IPC → `file.read`) go through this single function.
 */
async function readPluginBundleSource(artifactRoot: string, relativePath: string): Promise<string> {
  const bridge = tryGetSynraPluginRuntimeBridge()
  if (!bridge || typeof bridge.readFile !== 'function') {
    throw new Error('Cannot read plugin bundle source: no plugin host bridge is available.')
  }
  const normalizedRoot = artifactRoot.replace(/\\/g, '/').replace(/\/+$/, '')
  const rel = join(normalizedRoot, 'package', relativePath).replace(/^\/+/, '')
  const fileResult = await bridge.readFile({ path: rel, encoding: 'utf-8' })
  if (!fileResult || typeof fileResult.content !== 'string') {
    throw new Error(`Plugin bundle source is empty: ${rel}`)
  }
  return fileResult.content
}

/**
 * Walk the plugin bundle's chunk graph and emit one blob URL per chunk.
 * Each chunk source is rewritten in two passes:
 *
 *   1. Bare specifiers (`vue`, `@synra/plugin-sdk`, …) → absolute URL from
 *      the document importmap, just like the entry already does. Bare
 *      specs never collide with chunk specs because chunk paths always
 *      start with `./` or `../`.
 *   2. Relative specifiers (`./foo.js`, `../dist-BrPzbUTp.js`, even
 *      `import("../web-C_Bi8r_H.js")` inside an async factory) → the
 *      dependency chunk's blob URL. Keeps dynamic imports lazy: the
 *      relative path becomes a `blob:` URL, but the surrounding `()`
 *      call form is preserved, so the runtime still defers the load
 *      until the factory invokes it.
 *
 * The output is a DAG map: `chunkRelPath → blobUrl`. The entry's blob URL
 * is the one the caller will `import()`. Cycle detection guards
 * `inProgress` against pathological self-references; legitimate v3
 * plugin chunks form a DAG so the guard mostly stays a defensive guardrail.
 */
async function loadPluginModuleGraph(
  artifactRoot: string,
  entryRelPath: string,
  importMap: Record<string, string>,
  baseUrl: string
): Promise<{ entryBlobUrl: string; blobUrls: string[] }> {
  const blobByRelPath = new Map<string, string>()
  const blobUrls: string[] = []
  const inProgress = new Set<string>()

  async function collectRelativeSpecs(source: string): Promise<string[]> {
    const out: string[] = []
    let match: RegExpExecArray | null
    for (const re of [RELATIVE_FROM_RE, RELATIVE_SIDE_RE, RELATIVE_DYN_RE]) {
      re.lastIndex = 0
      while ((match = re.exec(source))) {
        const spec = match[re === RELATIVE_DYN_RE ? 2 : 4]
        out.push(spec)
      }
    }
    return out
  }

  async function ensureChunkBlob(relPath: string): Promise<string> {
    const cached = blobByRelPath.get(relPath)
    if (cached) return cached
    if (inProgress.has(relPath)) {
      throw new Error(`[synra-plugin-loader] cyclic relative import detected for chunk: ${relPath}`)
    }
    inProgress.add(relPath)

    const source = await readPluginBundleSource(artifactRoot, relPath)
    const chunkDir = dirname(relPath).replaceAll('\\', '/')

    // Recurse into deps first so their blob URLs exist when we rewrite
    // this chunk's source.
    const specs = await collectRelativeSpecs(source)
    const specToBlob = new Map<string, string>()
    for (const spec of specs) {
      const abs = resolveRelativeImport(chunkDir, spec)
      const blobUrl = await ensureChunkBlob(abs)
      specToBlob.set(spec, blobUrl)
    }

    let rewritten = rewriteBareSpecifiers(source, importMap, baseUrl)
    for (const [spec, blobUrl] of specToBlob) {
      // Quote-delimited spec regex: ([`"'])<escaped-spec>\1. String
      // concatenation is required because a regex literal that includes
      // a backtick would otherwise close the surrounding template literal
      // mid-string (oxfmt surfaces this as "Unterminated string").
      const pattern = new RegExp('([' + '`' + `'"` + '])' + escapeRegexLiteral(spec) + '\\1', 'g')
      rewritten = rewritten.replace(pattern, (_match, quote) => quote + blobUrl + quote)
    }

    const blob = new Blob([rewritten], { type: 'application/javascript' })
    const blobUrl = URL.createObjectURL(blob)
    blobUrls.push(blobUrl)
    blobByRelPath.set(relPath, blobUrl)
    inProgress.delete(relPath)
    return blobUrl
  }

  const entryBlobUrl = await ensureChunkBlob(entryRelPath)
  return { entryBlobUrl, blobUrls }
}

async function importPluginBundle(
  artifactRoot: string,
  entryRelPath: string
): Promise<{ default: unknown }> {
  const importMap = readSynraDocumentImportMap()
  const baseUrl = window.location.origin + '/'
  const { entryBlobUrl, blobUrls } = await loadPluginModuleGraph(
    artifactRoot,
    entryRelPath,
    importMap,
    baseUrl
  )
  try {
    return (await import(/* @vite-ignore */ entryBlobUrl)) as { default: unknown }
  } finally {
    // Keep every chunk blob alive until the entry import resolves. Earlier
    // versions revoked just the entry blob via queueMicrotask, but with a
    // multi-chunk graph each chunk's blob is referenced by sibling modules
    // imported during the entry's parse. Revoking them all in the same
    // microtask preserves the "no long-lived global state" property while
    // not racing the parser on slower devices.
    queueMicrotask(() => {
      for (const url of blobUrls) URL.revokeObjectURL(url)
    })
  }
}

export class PluginRouteBinder {
  private readonly pagesByPlugin = new Map<string, Map<string, RegisteredPage>>()
  private readonly pluginRootById = new Map<string, string>()
  private readonly bridgesByPluginId = new Map<string, PluginBridge>()

  /**
   * Stash the per-plugin bridge so the lazy loader can `provide` it at
   * route-mount time. Called by `PluginLifecycleManager.activate()` after
   * `createPluginBridge(...)`.
   */
  setBridge(pluginId: string, bridge: PluginBridge): void {
    this.bridgesByPluginId.set(pluginId, bridge)
  }

  clearBridge(pluginId: string): void {
    this.bridgesByPluginId.delete(pluginId)
  }

  /**
   * Returns the bridge for a plugin if one has been stashed. Used as a
   * fallback when `attachRoutes` runs before `setBridge` (e.g. when the
   * route binder is queried by the host outside the activate flow).
   */
  getBridge(pluginId: string): PluginBridge | undefined {
    return this.bridgesByPluginId.get(pluginId)
  }

  async attachRoutes(
    router: Router,
    pluginId: string,
    artifactRoot?: string,
    defaultPage: string = 'home',
    uiEntryPath?: string
  ): Promise<void> {
    if (artifactRoot) {
      this.pluginRootById.set(pluginId, artifactRoot.replace(/\\/g, '/'))
    }
    const pages = await this.resolvePages(pluginId, artifactRoot, defaultPage, uiEntryPath)
    this.pagesByPlugin.set(pluginId, pages)
    for (const page of pages.values()) {
      if (router.hasRoute(page.routeName)) {
        continue
      }
      router.addRoute({
        name: page.routeName,
        path: this.toRuntimePath(pluginId, page.pagePath),
        // `loader` returns a wrapped component that `provide`s the
        // SYNRA_BRIDGE_KEY before delegating to the plugin's default
        // export. Plugin pages `inject(SYNRA_BRIDGE_KEY, ...)` to get
        // host singletons (paired devices, envelope).
        component: this.wrapWithBridgeProvider(pluginId, page.loader),
        meta: {
          pluginId,
          pluginPagePath: page.pagePath
        }
      })
    }
  }

  private wrapWithBridgeProvider(
    pluginId: string,
    loader: () => Promise<{ default: unknown }>
  ): Component {
    // Capture the bridges map by reference so the setup function (where
    // `this` is Vue's proxy, not this binder) can still look up the
    // plugin's bridge.
    const bridgesRef = this.bridgesByPluginId
    return defineComponent({
      name: `SynraPluginRouteHost_${pluginId}`,
      setup() {
        const bridge = bridgesRef.get(pluginId)
        if (!bridge) {
          throw new Error(
            `[synra] PluginBridge for plugin '${pluginId}' was not registered before route mount. ` +
              `Ensure PluginLifecycleManager.activate() runs before this route is resolved.`
          )
        }
        // Provide MUST run synchronously in setup() — calling it after
        // an await turns the setup into an async setup, which then
        // requires a <Suspense> boundary in the parent component tree.
        // The plugin's own component (mod.default) gets the bridge via
        // inject() in its own (async) setup.
        provide(SYNRA_BRIDGE_KEY, bridge)

        // Kick off the module load eagerly but don't block setup. The
        // render function awaits the resolved module and shows a tiny
        // placeholder while the dynamic import is in flight.
        const modRef = ref<{ default: unknown } | null>(null)
        const errorRef = ref<unknown>(null)
        loader()
          .then((mod) => {
            modRef.value = mod
          })
          .catch((error) => {
            errorRef.value = error
            const e = error as { name?: string; message?: string; stack?: string }
            console.error(
              `[synra-plugin-loader] pluginId=${pluginId} import failed: ${e?.name} | ${e?.message}`
            )
          })

        return () => {
          if (errorRef.value) {
            throw errorRef.value
          }
          if (!modRef.value) {
            return h('div', { class: 'p-4 text-sm text-muted-2' }, 'Loading plugin…')
          }
          return h(modRef.value.default as never)
        }
      }
    })
  }

  private async resolvePages(
    pluginId: string,
    artifactRoot: string | undefined,
    defaultPage: string,
    uiEntryPath?: string
  ): Promise<Map<string, RegisteredPage>> {
    const manifest = await this.resolvePagesManifest(artifactRoot, defaultPage, uiEntryPath)
    const byPlugin = new Map<string, RegisteredPage>()
    for (const page of manifest.pages) {
      const normalizedPagePath = normalizePluginPagePath(page.path)
      byPlugin.set(normalizedPagePath, {
        pagePath: normalizedPagePath,
        routeName: this.toRouteName(pluginId, normalizedPagePath),
        loader: this.resolvePageLoader(pluginId, artifactRoot, page.file)
      })
    }
    return byPlugin
  }

  private async resolvePagesManifest(
    artifactRoot: string | undefined,
    defaultPage: string,
    uiEntryPath?: string
  ): Promise<PagesManifest> {
    if (!artifactRoot) {
      throw new Error('Cannot resolve installed plugin pages manifest without artifactRoot.')
    }

    const bridge = tryGetSynraPluginRuntimeBridge()
    if (!bridge) {
      throw new Error(
        'Cannot resolve installed plugin pages manifest without a plugin host bridge.'
      )
    }
    const normalizedRoot = artifactRoot.replace(/\\/g, '/')
    const manifestPaths = [
      `${normalizedRoot}/package/dist/ui/pages.json`,
      `${normalizedRoot}/package/dist/pages.json`
    ]

    for (const manifestPath of manifestPaths) {
      try {
        const fileResult = await bridge.readFile({ path: manifestPath, encoding: 'utf-8' })
        const parsed = JSON.parse(fileResult.content) as PagesManifest
        if (Array.isArray(parsed.pages)) {
          return parsed
        }
      } catch {
        // Try the next candidate path.
      }
    }
    const fallbackFile = this.resolveFallbackPageFile(uiEntryPath)
    // Fallback for plugins that only ship a single UI entry module.
    return {
      pages: [{ path: `/${defaultPage}`, file: fallbackFile }]
    }
  }

  private resolveFallbackPageFile(uiEntryPath?: string): string {
    const normalizedEntry = (uiEntryPath ?? '')
      .replace(/\\/g, '/')
      .replace(/^\/+/, '')
      .replace(/^\.\//, '')
    if (!normalizedEntry) {
      // v3 fallback: every plugin ships a single bundle at dist/synra/index.js.
      return 'dist/synra/index.js'
    }
    return normalizedEntry
  }

  private resolvePageLoader(
    pluginId: string,
    artifactRoot: string | undefined,
    pageFilePath: string
  ): () => Promise<{ default: unknown }> {
    if (!artifactRoot) {
      throw new Error('Cannot resolve page loader without artifactRoot.')
    }
    // Reserved: per-plugin bundle-source cache keys, once `bridge.readFile`
    // is capability-gated through PluginBridge.
    void pluginId
    const normalizedFilePath = pageFilePath.replace(/^\/+/, '').replace(/^\.\//, '')
    return async () => {
      return await importPluginBundle(artifactRoot, normalizedFilePath)
    }
  }

  detachRoutes(router: Router, pluginId: string): void {
    const pages = this.pagesByPlugin.get(pluginId) ?? new Map<string, RegisteredPage>()
    for (const page of pages.values()) {
      if (router.hasRoute(page.routeName)) {
        router.removeRoute(page.routeName)
      }
    }
    this.pagesByPlugin.set(pluginId, new Map<string, RegisteredPage>())
  }

  resolveRuntimePath(pluginId: string, pagePath: string): string {
    return this.toRuntimePath(pluginId, pagePath)
  }

  private toPageKey(pagePath: string): string {
    return normalizePluginPagePath(pagePath).replace(/^\//, '')
  }

  private toRouteName(pluginId: string, pagePath: string): string {
    return `plugin:${pluginId}:${this.toPageKey(pagePath)}`
  }

  private toRuntimePath(pluginId: string, pagePath: string): string {
    return `/plugin-${pluginId}${normalizePluginPagePath(pagePath)}`
  }
}
