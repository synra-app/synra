import { normalizePluginPagePath } from '@synra/plugin-sdk'
import { createElectronBridgePluginFromGlobal } from '@synra/capacitor-electron/plugin'
import type { Router } from 'vue-router'
import type { PagesManifest, RegisteredPage } from './types'
import { toPluginAssetUrl } from './plugin-asset-url'

export class PluginRouteBinder {
  private readonly pagesByPlugin = new Map<string, Map<string, RegisteredPage>>()
  private readonly pluginRootById = new Map<string, string>()

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
        component: page.loader,
        meta: {
          pluginId,
          pluginPagePath: page.pagePath
        }
      })
    }
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
    if (!artifactRoot || !window.__synraCapElectron?.invoke) {
      throw new Error('Cannot resolve installed plugin pages manifest without artifactRoot.')
    }

    const bridge = createElectronBridgePluginFromGlobal()
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
      return 'dist/ui/index.mjs'
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
    const normalizedFilePath = pageFilePath.replace(/^\/+/, '').replace(/^\.\//, '')
    const moduleRelativePath = normalizedFilePath.replace(/\.vue$/i, '.mjs')
    const candidatePaths = this.resolvePageModuleCandidates(moduleRelativePath)
    return async () => {
      for (let index = 0; index < candidatePaths.length; index += 1) {
        const candidatePath = candidatePaths[index]
        try {
          return (await import(/* @vite-ignore */ toPluginAssetUrl(pluginId, candidatePath))) as {
            default: unknown
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          const isFetchFailure = message.includes('Failed to fetch dynamically imported module')
          const isBareSpecifierFailure = message.includes('Failed to resolve module specifier')
          const hasNextCandidate = index < candidatePaths.length - 1
          if (isFetchFailure && hasNextCandidate) {
            continue
          }
          if (isBareSpecifierFailure) {
            return (await import(
              /* @vite-ignore */
              this.toPluginFsSpecifier(pluginId, candidatePath)
            )) as {
              default: unknown
            }
          }
          throw error
        }
      }
      throw new Error(`Cannot resolve plugin page module for '${pluginId}': ${moduleRelativePath}.`)
    }
  }

  private toPluginFsSpecifier(pluginId: string, relativePath: string): string {
    const artifactRoot = this.pluginRootById.get(pluginId)
    if (!artifactRoot) {
      throw new Error(`Cannot resolve @fs fallback path for plugin '${pluginId}'.`)
    }
    const fsPath = `${artifactRoot}/package/${relativePath.replace(/^\/+/, '')}`
    return `/@fs/${encodeURI(fsPath.replace(/^\/+/, ''))}`
  }

  private resolvePageModuleCandidates(moduleRelativePath: string): string[] {
    const normalized = moduleRelativePath.replace(/^\/+/, '')
    const candidates: string[] = []
    const pushUnique = (value: string): void => {
      const clean = value.replace(/^\/+/, '')
      if (!candidates.includes(clean)) {
        candidates.push(clean)
      }
    }
    if (normalized.startsWith('dist/ui/')) {
      pushUnique(normalized)
      pushUnique(`dist/${normalized.slice('dist/ui/'.length)}`)
      return candidates
    }
    if (normalized.startsWith('dist/pages/')) {
      pushUnique(`dist/ui/${normalized.slice('dist/'.length)}`)
      pushUnique(normalized)
      return candidates
    }
    if (normalized.startsWith('dist/')) {
      pushUnique(normalized)
      pushUnique(`dist/ui/${normalized.slice('dist/'.length)}`)
      return candidates
    }
    pushUnique(`dist/ui/${normalized}`)
    pushUnique(`dist/${normalized}`)
    return candidates
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
