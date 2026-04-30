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
export default defineConfig({
  build: {
    minify: true
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
  plugins
} as UserConfig)
