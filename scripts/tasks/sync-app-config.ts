import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { resolveRepositoryRoot } from '../common/utils.ts'
import { loadAppConfig } from '../config/app-config.ts'

const rootDir = resolveRepositoryRoot(import.meta.url)

function replaceOrThrow(
  content: string,
  pattern: RegExp,
  nextValue: string,
  label: string
): string {
  if (!pattern.test(content)) {
    throw new Error(`failed to update ${label}: pattern not found`)
  }
  return content.replace(pattern, nextValue)
}

async function updateFrontendTitle(appName: string): Promise<void> {
  const filePath = resolve(rootDir, 'apps/frontend/index.html')
  const content = await readFile(filePath, 'utf8')
  const next = replaceOrThrow(
    content,
    /<title>[\s\S]*?<\/title>/,
    `<title>${appName}</title>`,
    'frontend title'
  )
  await writeFile(filePath, next, 'utf8')
}

async function updateElectronPackageProductName(
  appName: string,
  appVersion: string
): Promise<void> {
  const filePath = resolve(rootDir, 'apps/electron/package.json')
  const raw = await readFile(filePath, 'utf8')
  const json = JSON.parse(raw) as {
    version?: string
    build?: {
      productName?: string
      artifactName?: string
    }
  }
  json.version = appVersion
  json.build = json.build ?? {}
  json.build.productName = appName
  json.build.artifactName = '${productName}-${version}-${os}-${arch}.${ext}'
  await writeFile(filePath, `${JSON.stringify(json, null, 2)}\n`, 'utf8')
}

async function updateWorkspaceVersions(appVersion: string): Promise<void> {
  const packageJsonPaths = [
    resolve(rootDir, 'package.json'),
    resolve(rootDir, 'apps/frontend/package.json'),
    resolve(rootDir, 'apps/mobile/package.json'),
    resolve(rootDir, 'apps/electron/package.json'),
    resolve(rootDir, 'packages/capacitor-electron/package.json'),
    resolve(rootDir, 'packages/protocol/package.json'),
    resolve(rootDir, 'packages/plugin-sdk/package.json'),
    resolve(rootDir, 'packages/transport-core/package.json'),
    resolve(rootDir, 'packages/utils/package.json'),
    resolve(rootDir, 'packages/vite-plugin-synra-electron/package.json')
  ]

  for (const filePath of packageJsonPaths) {
    const raw = await readFile(filePath, 'utf8')
    const json = JSON.parse(raw) as { version?: string }
    json.version = appVersion
    await writeFile(filePath, `${JSON.stringify(json, null, 2)}\n`, 'utf8')
  }
}

async function updateCapacitorAppNames(appName: string): Promise<void> {
  const mobileCapConfigPath = resolve(rootDir, 'apps/mobile/capacitor.config.ts')
  const electronCapConfigPath = resolve(rootDir, 'apps/electron/capacitor.config.ts')

  const mobileCapConfig = await readFile(mobileCapConfigPath, 'utf8')
  const electronCapConfig = await readFile(electronCapConfigPath, 'utf8')

  const nextMobileCapConfig = replaceOrThrow(
    mobileCapConfig,
    /appName:\s*"[^"]*"/,
    `appName: "${appName}"`,
    'mobile capacitor appName'
  )
  const nextElectronCapConfig = replaceOrThrow(
    electronCapConfig,
    /appName:\s*"[^"]*"/,
    `appName: "${appName}"`,
    'electron capacitor appName'
  )

  await writeFile(mobileCapConfigPath, nextMobileCapConfig, 'utf8')
  await writeFile(electronCapConfigPath, nextElectronCapConfig, 'utf8')
}

async function updateAndroidAppNames(appName: string): Promise<void> {
  const filePath = resolve(rootDir, 'apps/mobile/android/app/src/main/res/values/strings.xml')
  const content = await readFile(filePath, 'utf8')
  let next = replaceOrThrow(
    content,
    /<string name="app_name">[\s\S]*?<\/string>/,
    `<string name="app_name">${appName}</string>`,
    'android app_name'
  )
  next = replaceOrThrow(
    next,
    /<string name="title_activity_main">[\s\S]*?<\/string>/,
    `<string name="title_activity_main">${appName}</string>`,
    'android title_activity_main'
  )
  await writeFile(filePath, next, 'utf8')
}

async function updateIosDisplayName(appName: string): Promise<void> {
  const filePath = resolve(rootDir, 'apps/mobile/ios/App/App/Info.plist')
  const content = await readFile(filePath, 'utf8')
  const next = replaceOrThrow(
    content,
    /(<key>CFBundleDisplayName<\/key>\s*<string>)[\s\S]*?(<\/string>)/,
    `$1${appName}$2`,
    'iOS CFBundleDisplayName'
  )
  await writeFile(filePath, next, 'utf8')
}

async function updateAndroidVersionInfo(appVersion: string, appBuildNumber: number): Promise<void> {
  const filePath = resolve(rootDir, 'apps/mobile/android/app/build.gradle')
  const content = await readFile(filePath, 'utf8')
  let next = replaceOrThrow(
    content,
    /versionCode\s+\d+/,
    `versionCode ${String(appBuildNumber)}`,
    'android versionCode'
  )
  next = replaceOrThrow(
    next,
    /versionName\s+"[^"]*"/,
    `versionName "${appVersion}"`,
    'android versionName'
  )
  await writeFile(filePath, next, 'utf8')
}

async function updateIosVersionInfo(appVersion: string, appBuildNumber: number): Promise<void> {
  const filePath = resolve(rootDir, 'apps/mobile/ios/App/App.xcodeproj/project.pbxproj')
  const content = await readFile(filePath, 'utf8')
  let next = replaceOrThrow(
    content,
    /MARKETING_VERSION = [^;]+;/g,
    `MARKETING_VERSION = ${appVersion};`,
    'iOS MARKETING_VERSION'
  )
  next = replaceOrThrow(
    next,
    /CURRENT_PROJECT_VERSION = [^;]+;/g,
    `CURRENT_PROJECT_VERSION = ${String(appBuildNumber)};`,
    'iOS CURRENT_PROJECT_VERSION'
  )
  await writeFile(filePath, next, 'utf8')
}

async function updateBridgeApiVersion(apiVersion: string): Promise<void> {
  const major = apiVersion.split('.')[0] ?? '1'
  const constantsPath = resolve(
    rootDir,
    'packages/capacitor-electron/src/shared/protocol/constants.ts'
  )
  const readmePath = resolve(rootDir, 'packages/capacitor-electron/README.md')

  const constants = await readFile(constantsPath, 'utf8')
  let nextConstants = replaceOrThrow(
    constants,
    /BRIDGE_PROTOCOL_VERSION = "[^"]+"/,
    `BRIDGE_PROTOCOL_VERSION = "${apiVersion}"`,
    'bridge protocol version'
  )
  nextConstants = replaceOrThrow(
    nextConstants,
    /BRIDGE_INVOKE_CHANNEL = "[^"]+"/,
    `BRIDGE_INVOKE_CHANNEL = "synra:cap-electron:v${major}:invoke"`,
    'bridge invoke channel version'
  )
  await writeFile(constantsPath, nextConstants, 'utf8')

  const readme = await readFile(readmePath, 'utf8')
  const nextReadme = replaceOrThrow(
    readme,
    /- Protocol version: `[^`]+`/,
    `- Protocol version: \`${apiVersion}\``,
    'bridge README protocol version'
  )
  await writeFile(readmePath, nextReadme, 'utf8')
}

async function main(): Promise<void> {
  const { appName, appVersion, appBuildNumber, apiVersion } = loadAppConfig(import.meta.url)
  await updateWorkspaceVersions(appVersion)
  await updateFrontendTitle(appName)
  await updateElectronPackageProductName(appName, appVersion)
  await updateCapacitorAppNames(appName)
  await updateAndroidAppNames(appName)
  await updateIosDisplayName(appName)
  await updateAndroidVersionInfo(appVersion, appBuildNumber)
  await updateIosVersionInfo(appVersion, appBuildNumber)
  await updateBridgeApiVersion(apiVersion)
  console.log(
    `[sync-app-config] synced appName="${appName}" appVersion="${appVersion}" build=${String(appBuildNumber)} apiVersion="${apiVersion}"`
  )
}

await main()
