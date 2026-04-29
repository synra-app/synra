import { describe, expect, test } from 'vite-plus/test'
import {
  DEFAULT_SYNRA_UI_ENTRY,
  resolveSynraPluginUiEntryAbsolutePath,
  resolveSynraPluginUiEntryRelativePath
} from '../src/resolve-ui-entry.ts'

describe('resolveSynraPluginUiEntryRelativePath', () => {
  test('uses default when entries missing or ui empty', () => {
    expect(resolveSynraPluginUiEntryRelativePath(undefined)).toBe(DEFAULT_SYNRA_UI_ENTRY)
    expect(resolveSynraPluginUiEntryRelativePath({})).toBe(DEFAULT_SYNRA_UI_ENTRY)
    expect(resolveSynraPluginUiEntryRelativePath({ ui: '  ' })).toBe(DEFAULT_SYNRA_UI_ENTRY)
  })

  test('uses manifest ui entry', () => {
    expect(resolveSynraPluginUiEntryRelativePath({ ui: 'dist/custom/ui.mjs' })).toBe(
      'dist/custom/ui.mjs'
    )
  })
})

describe('resolveSynraPluginUiEntryAbsolutePath', () => {
  test('joins artifact root package subdir', () => {
    expect(resolveSynraPluginUiEntryAbsolutePath('/a/b', undefined)).toBe(
      '/a/b/package/dist/ui/index.mjs'
    )
    expect(
      resolveSynraPluginUiEntryAbsolutePath('C:\\\\Users\\\\x', { ui: 'dist/ui/index.mjs' })
    ).toBe('C:/Users/x/package/dist/ui/index.mjs')
  })
})
