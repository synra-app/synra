import type { PluginAction, ShareInput, SynraActionPlugin } from '@synra/plugin-sdk'
import type { SynraActionReceipt, SynraErrorCode } from '@synra/protocol'
import type { ExternalLinkService } from '../../src/host/services/external-link.service'

const PLUGIN_ID = 'test-external-url'

function normalizeHttpsUrl(input: ShareInput): string | null {
  const raw = input.raw.trim()
  if (raw.length === 0 || !raw.startsWith('https://')) {
    return null
  }
  try {
    return new URL(raw).toString()
  } catch {
    return null
  }
}

function successReceipt(
  action: PluginAction,
  output: unknown,
  durationMs: number
): SynraActionReceipt {
  return {
    ok: true,
    actionId: action.actionId,
    handledBy: PLUGIN_ID,
    durationMs,
    output
  }
}

function failureReceipt(
  action: PluginAction,
  code: SynraErrorCode,
  message: string,
  durationMs: number
): SynraActionReceipt {
  return {
    ok: false,
    actionId: action.actionId,
    handledBy: PLUGIN_ID,
    durationMs,
    retryable: code !== 'INVALID_PARAMS',
    error: { code, message }
  }
}

/** Minimal runtime action plugin for bridge e2e tests (open any https URL). */
export function createOpenUrlRuntimeFixturePlugin(
  externalLinkService: ExternalLinkService
): SynraActionPlugin {
  return {
    id: PLUGIN_ID,
    version: '0.0.0',
    meta: {
      packageName: 'synra-plugin-test-external-url',
      displayName: 'Test external URL',
      defaultPage: 'home',
      builtin: false
    },
    async supports(input: ShareInput) {
      const url = normalizeHttpsUrl(input)
      return {
        matched: Boolean(url),
        score: url ? 80 : 0,
        reason: url ? 'HTTPS URL' : 'Not HTTPS'
      }
    },
    async buildActions(input: ShareInput) {
      const url = normalizeHttpsUrl(input)
      if (!url) {
        return []
      }
      return [
        {
          actionId: `${PLUGIN_ID}:open`,
          pluginId: PLUGIN_ID,
          actionType: 'external.open-url',
          label: 'Open in browser',
          requiresConfirm: true,
          payload: { url }
        }
      ]
    },
    async execute(action: PluginAction) {
      const startedAt = Date.now()
      const payload = action.payload
      const url =
        payload &&
        typeof payload === 'object' &&
        'url' in payload &&
        typeof payload.url === 'string'
          ? payload.url
          : null
      if (!url) {
        return failureReceipt(
          action,
          'INVALID_PARAMS',
          'Missing URL in action payload.',
          Date.now() - startedAt
        )
      }
      try {
        await externalLinkService.openExternal(url)
        return successReceipt(action, { url }, Date.now() - startedAt)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to open URL.'
        return failureReceipt(action, 'RUNTIME_EXECUTION_FAILED', message, Date.now() - startedAt)
      }
    }
  }
}
