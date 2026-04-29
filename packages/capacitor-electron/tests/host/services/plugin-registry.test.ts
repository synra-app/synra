import { afterEach, describe, expect, test } from 'vite-plus/test'
import {
  normalizePluginRegistryUrl,
  resolvePluginRegistryUrl
} from '../../../src/host/services/plugin-registry'

const previousRegistryUrl = process.env.SYNRA_PLUGIN_REGISTRY_URL

describe('host/services/plugin-registry', () => {
  afterEach(() => {
    if (previousRegistryUrl === undefined) {
      delete process.env.SYNRA_PLUGIN_REGISTRY_URL
      return
    }
    process.env.SYNRA_PLUGIN_REGISTRY_URL = previousRegistryUrl
  })

  test('normalizes trailing slash and validates protocol', () => {
    expect(normalizePluginRegistryUrl('https://registry.npmjs.org///')).toBe(
      'https://registry.npmjs.org'
    )
    expect(() => normalizePluginRegistryUrl('file://registry.local')).toThrow(
      'Invalid registry url'
    )
  })

  test('uses explicit input before env and default', () => {
    process.env.SYNRA_PLUGIN_REGISTRY_URL = 'https://registry.npmmirror.com/'
    expect(resolvePluginRegistryUrl('https://mirrors.tencent.com/npm/')).toBe(
      'https://mirrors.tencent.com/npm'
    )
  })

  test('falls back to env and then default npm registry', () => {
    process.env.SYNRA_PLUGIN_REGISTRY_URL = 'https://repo.huaweicloud.com/repository/npm/'
    expect(resolvePluginRegistryUrl()).toBe('https://repo.huaweicloud.com/repository/npm')

    delete process.env.SYNRA_PLUGIN_REGISTRY_URL
    expect(resolvePluginRegistryUrl()).toBe('https://registry.npmjs.org')
  })
})
