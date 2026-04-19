export type AppMenuItem = {
  label: string
  icon: string
  to: string
}

export const appMenuItems: AppMenuItem[] = [
  { label: 'Home', icon: 'i-lucide-house', to: '/home' },
  { label: 'Plugins', icon: 'i-lucide-puzzle', to: '/plugins' },
  { label: 'Devices', icon: 'i-lucide-monitor-smartphone', to: '/devices' },
  { label: 'Settings', icon: 'i-lucide-settings', to: '/settings' }
]
