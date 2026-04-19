import { describe, expect, test, vi } from 'vite-plus/test'
import { createExternalLinkService } from '../../../src/host/services/external-link.service'
import { BRIDGE_ERROR_CODES } from '../../../src/shared/errors/codes'

describe('host/services/external-link.service', () => {
  test('opens http and https urls', async () => {
    const openExternal = vi.fn(async () => undefined)
    const service = createExternalLinkService({ openExternal })

    const result = await service.openExternal('https://synra.dev')

    expect(result).toEqual({ success: true })
    expect(openExternal).toHaveBeenCalledWith('https://synra.dev/')
  })

  test('rejects malformed urls', async () => {
    const service = createExternalLinkService({ openExternal: vi.fn(async () => undefined) })
    await expect(service.openExternal('not-a-url')).rejects.toMatchObject({
      code: BRIDGE_ERROR_CODES.invalidParams
    })
  })

  test('rejects disallowed protocols', async () => {
    const service = createExternalLinkService({ openExternal: vi.fn(async () => undefined) })
    await expect(service.openExternal('file:///tmp/unsafe.txt')).rejects.toMatchObject({
      code: BRIDGE_ERROR_CODES.unauthorized
    })
  })
})
