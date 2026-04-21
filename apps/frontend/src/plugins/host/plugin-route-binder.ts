import { normalizePluginPagePath, pluginFilePathToPagePath } from '@synra/plugin-sdk'
import type { Router } from 'vue-router'
import type { PagesManifest, RegisteredPage } from './types'

export class PluginRouteBinder {
  private readonly pagesByPlugin = new Map<string, Map<string, RegisteredPage>>()
  // Source pages are available during local workspace development.
  private readonly pageSourceModules = import.meta.glob(
    '/node_modules/@synra-plugin/*/pages/**/index.vue'
  )
  // Dist pages are required for published plugin packages.
  private readonly pageDistModules = import.meta.glob(
    '/node_modules/@synra-plugin/*/dist/pages/**/index.mjs'
  )
  private readonly pageModuleLoaders = {
    // Prefer source modules in workspace development for better HMR and stable resolving.
    ...this.pageDistModules,
    ...this.pageSourceModules
  }
  private readonly pagesManifestModules = import.meta.glob(
    '/node_modules/@synra-plugin/*/dist/pages.json',
    {
      eager: true,
      import: 'default'
    }
  ) as Record<string, unknown>

  attachRoutes(router: Router, pluginId: string, packageName: string): void {
    const pages = this.resolvePages(pluginId, packageName)
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

  private resolvePages(pluginId: string, packageName: string): Map<string, RegisteredPage> {
    const manifest = this.resolvePagesManifest(packageName)
    const byPlugin = new Map<string, RegisteredPage>()
    for (const page of manifest.pages) {
      const normalizedPagePath = normalizePluginPagePath(page.path)
      byPlugin.set(normalizedPagePath, {
        pagePath: normalizedPagePath,
        routeName: this.toRouteName(pluginId, normalizedPagePath),
        loader: this.resolvePageLoader(packageName, page.file)
      })
    }
    return byPlugin
  }

  private resolvePagesManifest(packageName: string): PagesManifest {
    const manifestPath = `/node_modules/${packageName}/dist/pages.json`
    const manifest = this.pagesManifestModules[manifestPath] as PagesManifest | undefined
    if (manifest && Array.isArray(manifest.pages)) {
      return manifest
    }

    // Compatibility fallback for plugins that do not emit pages.json in development.
    const inferredManifest = this.inferPagesManifest(packageName)
    if (inferredManifest.pages.length > 0) {
      return inferredManifest
    }

    throw new Error(`Cannot resolve pages.json for package '${packageName}'.`)
  }

  private inferPagesManifest(packageName: string): PagesManifest {
    const pages = new Map<string, { path: string; file: string }>()
    const sourcePrefix = `/node_modules/${packageName}/`
    const distPrefix = `/node_modules/${packageName}/dist/`

    for (const sourceModulePath of Object.keys(this.pageSourceModules)) {
      if (!sourceModulePath.startsWith(sourcePrefix) || !sourceModulePath.endsWith('/index.vue')) {
        continue
      }
      const file = sourceModulePath.slice(sourcePrefix.length)
      const path = pluginFilePathToPagePath(file)
      pages.set(path, { path, file })
    }

    for (const distModulePath of Object.keys(this.pageDistModules)) {
      if (!distModulePath.startsWith(distPrefix) || !distModulePath.endsWith('/index.mjs')) {
        continue
      }
      const distRelativeFile = distModulePath.slice(distPrefix.length)
      const file = distRelativeFile.replace(/\.mjs$/i, '.vue')
      const path = pluginFilePathToPagePath(file)
      if (!pages.has(path)) {
        pages.set(path, { path, file })
      }
    }

    return {
      pages: [...pages.values()]
    }
  }

  private resolvePageLoader(
    packageName: string,
    pageFilePath: string
  ): () => Promise<{ default: unknown }> {
    const normalizedFilePath = pageFilePath.replace(/^\/+/, '')
    const sourcePath = `/node_modules/${packageName}/${normalizedFilePath}`
    const distPath = `/node_modules/${packageName}/dist/${normalizedFilePath.replace(/\.vue$/i, '.mjs')}`
    const loader = this.pageModuleLoaders[sourcePath] ?? this.pageModuleLoaders[distPath]
    if (!loader) {
      throw new Error(
        `Cannot resolve page module for '${packageName}' file '${normalizedFilePath}'.`
      )
    }
    return loader as () => Promise<{ default: unknown }>
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
