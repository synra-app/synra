import { loadConfigSync } from 'unconfig'
import { resolveRepositoryRoot } from '../common/utils.ts'

export type AppConfig = {
  appName: string
  appVersion: string
  appBuildNumber: number
  apiVersion: string
}

function ensureNonEmpty(value: string, field: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error(`config field "${field}" cannot be empty`)
  }
  return trimmed
}

function validateAppConfig(config: AppConfig): AppConfig {
  const appBuildNumber = Number(config.appBuildNumber)
  const appVersion = ensureNonEmpty(config.appVersion ?? '', 'appVersion')
  const apiVersion = ensureNonEmpty(config.apiVersion ?? '', 'apiVersion')

  if (!Number.isInteger(appBuildNumber) || appBuildNumber <= 0) {
    throw new Error(`config field "appBuildNumber" must be a positive integer`)
  }

  if (!/^\d+\.\d+\.\d+$/.test(appVersion)) {
    throw new Error(`config field "appVersion" must follow semver format like 1.2.3`)
  }

  if (!/^\d+\.\d+$/.test(apiVersion)) {
    throw new Error(`config field "apiVersion" must follow major.minor format like 1.0`)
  }

  return {
    appName: ensureNonEmpty(config.appName ?? '', 'appName'),
    appVersion,
    appBuildNumber,
    apiVersion
  }
}

export function loadAppConfig(fromImportMetaUrl: string): AppConfig {
  const rootDir = resolveRepositoryRoot(fromImportMetaUrl)
  const { config, sources } = loadConfigSync<Partial<AppConfig>>({
    cwd: rootDir,
    sources: [
      {
        files: 'app.config',
        parser: 'auto'
      }
    ]
  })

  if (!sources.length) {
    throw new Error(`missing app config file: ${rootDir}/app.config.ts`)
  }

  return validateAppConfig({
    appName: config.appName ?? '',
    appVersion: config.appVersion ?? '',
    appBuildNumber: Number(config.appBuildNumber),
    apiVersion: config.apiVersion ?? ''
  })
}
