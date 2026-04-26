import { beforeEach, describe, expect, test, vi } from 'vite-plus/test'
import { Capacitor } from '@capacitor/core'
import { createLogger } from '../src/index.ts'

describe('createLogger', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('web')
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
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('android')
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})

    const logger = createLogger('tcp')
    logger.info('recv', { requestId: '1', payload: { nested: true } })

    expect(infoSpy).toHaveBeenCalledWith(
      '[synra:tcp] recv {"requestId":"1","payload":{"nested":true}}'
    )
  })

  test('serializes problematic objects without [object Object]', () => {
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('android')
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const payload: Record<string, unknown> = {}
    Object.defineProperty(payload, 'broken', {
      enumerable: true,
      get() {
        throw new Error('boom')
      }
    })

    const logger = createLogger('tcp')
    logger.info('recv', payload)

    const message = infoSpy.mock.calls[0]?.[0]
    expect(typeof message).toBe('string')
    expect(message).not.toContain('[object Object]')
    expect(message).toContain('"broken":"[Thrown: boom]"')
  })
})
