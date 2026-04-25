import { defineConfig, presetIcons, presetWind3 } from 'unocss'
import { unoColors } from 'uno-colors'

const breakpoints = {
  xs: '320px',
  sm: '480px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
  '3xl': '1920px'
}

/** Align with [apps/frontend/uno.config.ts](apps/frontend/uno.config.ts) so plugin nav matches shell sidebar. */
export default defineConfig({
  theme: {
    colors: unoColors({
      primary: '#7c8cff',
      success: '#22c55e',
      warning: '#f59e0b',
      error: '#f87171',
      info: '#38bdf8',
      surface: '#0b1020',
      muted: '#94a3b8'
    }),
    breakpoints
  },
  shortcuts: [
    ['fcc', 'flex justify-center items-center'],
    [
      'glass-panel',
      'rounded-2xl bg-white/6 backdrop-blur-xl shadow-[0_10px_40px_rgba(3,8,24,0.45)]'
    ],
    ['glass-panel-soft', 'rounded-xl bg-white/4 backdrop-blur-lg'],
    [
      'glass-button',
      'rounded-lg border border-transparent bg-transparent text-muted-1 transition-all duration-200 hover:border-white/14 hover:bg-white/12 hover:backdrop-blur-lg active:scale-95'
    ],
    [
      'app-focus-ring',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-4/70 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-2'
    ]
  ],
  presets: [presetWind3(), presetIcons()]
})
