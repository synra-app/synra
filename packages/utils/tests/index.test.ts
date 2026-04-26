import { beforeEach, describe, expect, test, vi } from 'vite-plus/test'
import { createLogger } from '../src/index.ts'

describe('createLogger', () => {
  const runtime = globalThis as typeof globalThis & {
    window?: unknown
    navigator?: { userAgent?: string }
  }
  const originalWindow = runtime.window
  const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(runtime, 'navigator')

  beforeEach(() => {
    vi.restoreAllMocks()
    if (originalWindow === undefined) {
      delete runtime.window
    } else {
      runtime.window = originalWindow
    }
    if (originalNavigatorDescriptor) {
      Object.defineProperty(runtime, 'navigator', originalNavigatorDescriptor)
    } else {
      Object.defineProperty(runtime, 'navigator', {
        configurable: true,
        value: undefined
      })
    }
  })

  test('returns logger methods', () => {
    const logger = createLogger('tcp')
    expect(typeof logger.info).toBe('function')
    expect(typeof logger.success).toBe('function')
    expect(typeof logger.warn).toBe('function')
    expect(typeof logger.error).toBe('function')
  })

  test('prints in node runtime', () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write')
    const stderrSpy = vi.spyOn(process.stderr, 'write')
    const logger = createLogger('tcp')

    logger.info('node should print')
    logger.error('node should print')

    expect(stdoutSpy).toHaveBeenCalled()
    expect(stderrSpy).toHaveBeenCalled()
  })

  test('prints plain text in mobile runtime', () => {
    runtime.window = {}
    Object.defineProperty(runtime, 'navigator', {
      configurable: true,
      value: { userAgent: 'Mozilla/5.0 (Linux; Android 14)' }
    })
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})

    const logger = createLogger('tcp')
    logger.info('recv', { requestId: '1', payload: { nested: true } })

    expect(infoSpy).toHaveBeenCalledWith(
      '[synra:tcp] recv {"requestId":"1","payload":{"nested":true}}'
    )
  })
})
