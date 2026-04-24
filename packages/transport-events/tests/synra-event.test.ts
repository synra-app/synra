import { describe, expect, test } from 'vite-plus/test'
import {
  clearSynraWireEventRegistryForTests,
  createSynraEvent,
  dispatchSynraWireEvent,
  synraHandlersAllPlatforms
} from '../src/synra-event.js'
import {
  initSynraRuntimePlatform,
  resetSynraRuntimePlatformForTests
} from '../src/runtime-platform.js'

describe('createSynraEvent + dispatchSynraWireEvent', () => {
  test('dispatches to platform handler', async () => {
    resetSynraRuntimePlatformForTests()
    initSynraRuntimePlatform({ packTarget: 'web' })
    clearSynraWireEventRegistryForTests()
    let seen: string | undefined
    createSynraEvent({
      eventName: 'test.evt',
      handlers: synraHandlersAllPlatforms((ctx) => {
        seen = ctx.requestId
      })
    })
    await dispatchSynraWireEvent({
      eventName: 'test.evt',
      requestId: 'rid-1',
      sourceDeviceId: 'a',
      targetDeviceId: 'b',
      payload: {},
      transport: 'tcp'
    })
    expect(seen).toBe('rid-1')
  })

  test('no-op when eventName not registered', async () => {
    resetSynraRuntimePlatformForTests()
    initSynraRuntimePlatform({ packTarget: 'web' })
    clearSynraWireEventRegistryForTests()
    await expect(
      dispatchSynraWireEvent({
        eventName: 'missing',
        requestId: 'r',
        sourceDeviceId: 'a',
        targetDeviceId: 'b',
        payload: null,
        transport: 'tcp'
      })
    ).resolves.toBeUndefined()
  })
})
