import { Capacitor } from '@capacitor/core'

type AboutInfoItem = {
  label: string
  value: string
}

function toText(value: unknown): string {
  return String(value)
}

export function useAboutInfo() {
  const now = ref(new Date())
  const copyStatus = ref<'idle' | 'success' | 'error'>('idle')
  const copyMessage = ref('')
  let clearMessageTimer: ReturnType<typeof setTimeout> | undefined

  const platform = Capacitor.getPlatform()
  const isNative = Capacitor.isNativePlatform()
  const hasElectronBridge = Boolean(window.__synraCapElectron?.invoke)

  const buildMode = import.meta.env.MODE
  const isDev = import.meta.env.DEV
  const baseUrl = import.meta.env.BASE_URL
  const appName = __APP_NAME__
  const appVersion = __APP_VERSION__
  const buildTime = __APP_BUILD_TIME__
  const gitSha = __APP_GIT_SHA__

  const locale = navigator.language
  const userAgent = navigator.userAgent
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const screenSize = `${window.screen.width} x ${window.screen.height}`
  const viewportSize = `${window.innerWidth} x ${window.innerHeight}`

  const aboutInfo = computed<AboutInfoItem[]>(() => [
    { label: 'Current Time', value: now.value.toISOString() },
    { label: 'Capacitor Platform', value: platform },
    { label: 'Native Platform', value: isNative ? 'yes' : 'no' },
    { label: 'Electron Bridge', value: hasElectronBridge ? 'available' : 'unavailable' },
    { label: 'Build Mode', value: buildMode },
    { label: 'Is Dev', value: toText(isDev) },
    { label: 'Base URL', value: baseUrl },
    { label: 'App Name', value: appName },
    { label: 'App Version', value: appVersion },
    { label: 'Build Time', value: buildTime },
    { label: 'Git SHA', value: gitSha },
    { label: 'Locale', value: locale },
    { label: 'Timezone', value: timezone },
    { label: 'Screen Size', value: screenSize },
    { label: 'Viewport Size', value: viewportSize },
    { label: 'User Agent', value: userAgent }
  ])
  const diagnosticsPayload = computed<Record<string, string>>(() =>
    Object.fromEntries(aboutInfo.value.map((item) => [item.label, item.value]))
  )

  function refreshNow(): void {
    now.value = new Date()
  }

  async function copyDiagnostics(): Promise<void> {
    if (clearMessageTimer) {
      clearTimeout(clearMessageTimer)
      clearMessageTimer = undefined
    }

    try {
      await navigator.clipboard.writeText(JSON.stringify(diagnosticsPayload.value, null, 2))
      copyStatus.value = 'success'
      copyMessage.value = 'Diagnostics copied to clipboard.'
    } catch {
      copyStatus.value = 'error'
      copyMessage.value = 'Failed to copy diagnostics.'
    }

    clearMessageTimer = setTimeout(() => {
      copyStatus.value = 'idle'
      copyMessage.value = ''
      clearMessageTimer = undefined
    }, 2000)
  }

  return {
    aboutInfo,
    copyDiagnostics,
    copyMessage,
    copyStatus,
    diagnosticsPayload,
    refreshNow
  }
}
