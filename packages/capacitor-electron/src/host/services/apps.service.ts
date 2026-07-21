/**
 * Host-side service for "phone-as-controller" installed-app operations.
 *
 * Thin orchestration over the cross-OS `AppsAdapter`:
 *   - `listInstalled()` adapts `RawInstalledApp[]` from the adapter into
 *     `InstalledApp[]` (filling in the `platform` field the adapter
 *     doesn't know about — the service runs in the host main process
 *     so it can use `process.platform` directly).
 *   - `launch(appId)` translates adapter exceptions into the
 *     `AppLaunchResult` discriminated union so the phone never sees a
 *     raw `BridgeError` over the wire.
 *
 * Mirrors the shape of `external-link.service.ts` (factory + adapter
 * dep + `BridgeError` translation).
 */
import { BridgeError } from '../../shared/errors/bridge-error'
import { BRIDGE_ERROR_CODES } from '../../shared/errors/codes'
import type {
  AppLaunchResult,
  AppListInstalledResult,
  InstalledApp
} from '../../shared/protocol/types'
import type { AppsAdapter } from '../adapters/electron-apps.adapter'

export type AppsService = {
  listInstalled(): Promise<AppListInstalledResult>
  launch(appId: string): Promise<AppLaunchResult>
}

export function createAppsService(adapter: AppsAdapter): AppsService {
  return {
    async listInstalled(): Promise<AppListInstalledResult> {
      const raw = await adapter.listInstalled(process.platform)
      const apps: InstalledApp[] = raw.map((a) => {
        const out: InstalledApp = {
          appId: a.appId,
          name: a.name,
          platform: process.platform
        }
        if (a.iconUrl) out.iconUrl = a.iconUrl
        return out
      })
      return { apps }
    },
    async launch(appId: string): Promise<AppLaunchResult> {
      try {
        await adapter.launch(appId, process.platform)
        return { ok: true, appId }
      } catch (err) {
        // Map adapter errors to the discriminated union.
        // `unsupportedOperation` → platform unsupported;
        // `notFound` (thrown by the adapter when a Windows exe path
        // resolves to a missing file) → notFound;
        // everything else → spawnFailed (intentionally vague; the
        // real stderr stays in the host log via `console.warn`
        // inside the adapter).
        let reason: AppLaunchResult extends infer R
          ? R extends { ok: false; reason: infer K }
            ? K
            : never
          : never
        if (err instanceof BridgeError) {
          if (err.code === BRIDGE_ERROR_CODES.unsupportedOperation) {
            reason = 'unsupportedPlatform' as never
          } else if (err.code === BRIDGE_ERROR_CODES.notFound) {
            reason = 'notFound' as never
          } else {
            reason = 'spawnFailed' as never
          }
        } else {
          reason = 'spawnFailed' as never
        }
        // Log the raw error to the host main process so support
        // staff can debug without leaking stderr to the phone.
        console.warn('[synra:apps] launch failed', { appId, reason, err })
        return { ok: false, appId, reason } as AppLaunchResult
      }
    }
  }
}
