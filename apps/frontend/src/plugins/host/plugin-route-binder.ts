import { normalizePluginPagePath } from '@synra/plugin-sdk'
import { createElectronBridgePluginFromGlobal } from '@synra/capacitor-electron/api/plugin'
import type { Router } from 'vue-router'
import type { PagesManifest, RegisteredPage } from './types'

export class PluginRouteBinder {
  private readonly pagesByPlugin = new Map<string, Map<string, RegisteredPage>>()

  async attachRoutes(router: Router, pluginId: string, artifactRoot?: string): Promise<void> {
    const pages = await this.resolvePages(pluginId, artifactRoot)
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
    artifactRoot?: string
  ): Promise<Map<string, RegisteredPage>> {
    const manifest = await this.resolvePagesManifest(artifactRoot)
    const byPlugin = new Map<string, RegisteredPage>()
    for (const page of manifest.pages) {
      const normalizedPagePath = normalizePluginPagePath(page.path)
      byPlugin.set(normalizedPagePath, {
        pagePath: normalizedPagePath,
        routeName: this.toRouteName(pluginId, normalizedPagePath),
        loader: this.resolvePageLoader(artifactRoot, page.file)
      })
    }
    return byPlugin
  }

  private async resolvePagesManifest(artifactRoot?: string): Promise<PagesManifest> {
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
    throw new Error(`Cannot resolve pages.json in installed artifact root '${artifactRoot}'.`)
  }

  private resolvePageLoader(
    artifactRoot: string | undefined,
    pageFilePath: string
  ): () => Promise<{ default: unknown }> {
    if (!artifactRoot) {
      throw new Error('Cannot resolve page loader without artifactRoot.')
    }
    const normalizedFilePath = pageFilePath.replace(/^\/+/, '')
    const moduleRelativePath = normalizedFilePath.replace(/\.vue$/i, '.mjs')
    const normalizedRoot = artifactRoot.replace(/\\/g, '/')
    const distUiPath = `${normalizedRoot}/package/dist/ui/${moduleRelativePath}`
    const distPath = `${normalizedRoot}/package/dist/${moduleRelativePath}`
    return async () => {
      try {
        return (await import(/* @vite-ignore */ this.toFileModuleUrl(distUiPath))) as {
          default: unknown
        }
      } catch {
        return (await import(/* @vite-ignore */ this.toFileModuleUrl(distPath))) as {
          default: unknown
        }
      }
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

  private toFileModuleUrl(filePath: string): string {
    const normalized = filePath.replace(/\\/g, '/')
    if (/^[a-zA-Z]:\//.test(normalized)) {
      return `file:///${normalized}`
    }
    return `file://${normalized}`
  }
}
