import { execSync } from 'node:child_process'
import { dirname, resolve as pathResolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import UnoCSS from '@unocss/vite'
import Vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { defineConfig, type UserConfig } from 'vite-plus'
import VueRouter from 'vue-router/vite'
import { loadAppConfig } from '../../scripts/config/app-config'

const __dirname = dirname(fileURLToPath(import.meta.url))
const r = (p: string) => pathResolve(__dirname, p)
const projectRoot = __dirname
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

const plugins: any[] = []
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
  define: {
    __APP_NAME__: JSON.stringify(buildMeta.appName),
    __APP_VERSION__: JSON.stringify(buildMeta.appVersion),
    __APP_BUILD_TIME__: JSON.stringify(buildMeta.buildTime),
    __APP_GIT_SHA__: JSON.stringify(buildMeta.gitSha)
  },
  plugins
} as UserConfig)
