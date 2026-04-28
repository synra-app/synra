/**
 * Matches {@link resolveRuntimeAdapter}: Electron **main** uses `electron-main-adapter`;
 * renderer / Capacitor use `capacitor-adapter`.
 */
export function isElectronMainProcess(): boolean {
  const runtime = globalThis as unknown as {
    process?: { versions?: { electron?: string }; type?: string }
  }
  return Boolean(
    runtime.process?.versions?.electron &&
    (runtime.process?.type === 'browser' || !runtime.process?.type)
  )
}
