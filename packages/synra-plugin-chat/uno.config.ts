import { defineConfig, presetIcons, presetWind3 } from 'unocss'

const breakpoints = {
  xs: '320px',
  sm: '480px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
  '3xl': '1920px'
}

export default defineConfig({
  theme: {
    breakpoints
  },
  shortcuts: [
    [
      'glass-panel',
      'rounded-2xl bg-[#0b1020]/72 backdrop-blur-xl shadow-[0_10px_40px_rgba(3,8,24,0.45)]'
    ],
    ['glass-panel-soft', 'rounded-xl bg-white/6 backdrop-blur-lg'],
    [
      'glass-button',
      'rounded-lg border border-transparent bg-transparent text-slate-200 transition-all duration-200 hover:border-white/18 hover:bg-white/12 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50'
    ],
    [
      'app-focus-ring',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b1020]'
    ]
  ],
  presets: [presetWind3(), presetIcons()]
})
