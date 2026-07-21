import { vi } from 'vite-plus/test'
import type { ClipboardService } from '../../src/host/services/clipboard.service'

/**
 * Default `vi.fn` mock of `ClipboardService` for bridge dispatch tests.
 * Each method returns the same shape the real implementation would:
 *   - readText / readSelection → `{ text: '' }`
 *   - writeText → `undefined`
 *
 * Tests that need to assert specific behavior should override the
 * relevant `vi.fn` after construction, e.g.:
 *
 *   const svc = createClipboardServiceMock()
 *   svc.readSelection.mockResolvedValueOnce({ text: 'selected' })
 */
export function createClipboardServiceMock(): ClipboardService {
  return {
    readText: vi.fn(async () => ({ text: '' })),
    readSelection: vi.fn(async () => ({ text: '' })),
    writeText: vi.fn(async () => undefined)
  }
}
