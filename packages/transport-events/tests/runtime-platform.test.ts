import { describe, expect, test } from 'vite-plus/test'
import {
  getSynraRuntimePlatform,
  initSynraRuntimePlatform,
  resetSynraRuntimePlatformForTests
} from '../src/runtime-platform.js'

describe('@synra/transport-events runtime platform', () => {
  test('initSynraRuntimePlatform honors explicit packTarget', () => {
    resetSynraRuntimePlatformForTests()
    expect(initSynraRuntimePlatform({ packTarget: 'macos' })).toBe('macos')
    expect(getSynraRuntimePlatform()).toBe('macos')
  })

  test('getSynraRuntimePlatform throws before init', () => {
    resetSynraRuntimePlatformForTests()
    expect(() => getSynraRuntimePlatform()).toThrow(/initSynraRuntimePlatform/)
  })

  test('init is idempotent', () => {
    resetSynraRuntimePlatformForTests()
    initSynraRuntimePlatform({ packTarget: 'ios' })
    expect(initSynraRuntimePlatform({ packTarget: 'android' })).toBe('ios')
  })
})
