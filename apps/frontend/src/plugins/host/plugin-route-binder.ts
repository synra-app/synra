import { SYNRA_BRIDGE_KEY, type PluginBridge, normalizePluginPagePath } from '@synra/plugin-sdk'
import { join } from 'pathe'
import { defineComponent, h, provide, ref, type Component } from 'vue'
import type { Router } from 'vue-router'
import { tryGetSynraPluginRuntimeBridge } from '../bridge/synra-plugin-host-bridge'
import type { PagesManifest, RegisteredPage } from './types'

/**
 * v3 plugin bundles ship a single ESM module (`dist/synra/index.js`) whose
 * source references bare specifiers such as `import ... from 'vue'`. The
 * host exposes the Vue runtime via `<script type="importmap">` so static
 * `<script type="module">` resolves it, but per the HTML module-loader spec
 * `import()` does NOT inherit the document importmap. Without rewriting,
 * a plugin bundle's `import 'vue'` falls through to "Failed to resolve
 * module specifier" on every platform.
 *
 * The fix is uniform across Electron and Capacitor:
 *   1. Read the bundle source through the host bridge (`bridge.readFile`).
 *      `synra-plugin://` custom scheme looked tempting but `fetch()` from
 *      a renderer against a custom scheme is unreliable across Chromium
 *      versions (returns HTML error pages instead of the file body, hence
 *      the "Unexpected token '<'" we kept seeing). `bridge.readFile` is
 *      the IPC path the host already uses for `pages.json`, so we reuse
 *      it — Electron renderer → preload IPC → `file.read`, Capacitor
 *      native → `@capacitor/filesystem`.
 *   2. Replace any bare specifier the importmap has an answer for with
 *      the resolved absolute URL.
 *   3. Hand the rewritten bytes to a blob URL and `import()` the blob.
 *      Blob URLs also don't honour the importmap, but since the rewritten
 *      source already references absolute URLs there is nothing left to
 *      resolve.
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

async function importPluginBundleContentWithImportMap(
  source: string
): Promise<{ default: unknown }> {
  const importMap = readSynraDocumentImportMap()
  const baseUrl = window.location.origin + '/'
  const rewritten = rewriteBareSpecifiers(source, importMap, baseUrl)
  const blob = new Blob([rewritten], { type: 'application/javascript' })
  const blobUrl = URL.createObjectURL(blob)
  try {
    return (await import(/* @vite-ignore */ blobUrl)) as { default: unknown }
  } finally {
    // Keep the blob alive until the import resolves. Earlier version
    // revoked before the network/parse finished caused "Cannot find
    // module" races on slower devices.
    queueMicrotask(() => URL.revokeObjectURL(blobUrl))
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
      const source = await readPluginBundleSource(artifactRoot, normalizedFilePath)
      return await importPluginBundleContentWithImportMap(source)
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
