import { createLocalFontProcessor } from '@unocss/preset-web-fonts/local'
import { unoColors } from 'uno-colors'
import {
  defineConfig,
  presetAttributify,
  presetIcons,
  presetTypography,
  presetWebFonts,
  presetWind3,
  transformerDirectives,
  transformerVariantGroup
} from 'unocss'

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
  content: {
    filesystem: ['src/**/*.{vue,ts,tsx,js,jsx,html,css,scss}', 'index.html'],
    pipeline: {
      include: [/[\\/]src[\\/].*\.(vue|ts|tsx|js|jsx|html|css|scss)($|\?)/, /[\\/]index\.html$/],
      exclude: [/[\\/]node_modules[\\/]/, /[\\/]\.auto-generated[\\/]/, /[\\/]dist[\\/]/]
    }
  },
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
    [/^clickable(-.*)?$/, ([, scale]) => `cursor-pointer transition active:scale${scale || '-95'}`],
    ['bg-colorful', 'bg-gradient-to-tr from-[#bd34fe] to-[#47caff]'],
    ['text-colorful', 'bg-colorful text-transparent bg-clip-text'],
    ['pr', 'relative'],
    ['pa', 'absolute'],
    ['pf', 'fixed'],
    ['ps', 'sticky'],
    ['pxc', 'pa left-1/2 -translate-x-1/2'],
    ['pyc', 'pa top-1/2 -translate-y-1/2'],
    ['pcc', 'pxc pyc'],
    ['fcc', 'flex justify-center items-center'],
    ['fccc', 'fcc flex-col'],
    ['fxc', 'flex justify-center'],
    ['fyc', 'flex items-center'],
    ['fs', 'flex justify-start'],
    ['fsc', 'flex justify-start items-center'],
    ['fse', 'flex justify-start items-end'],
    ['fe', 'flex justify-end'],
    ['fec', 'flex justify-end items-center'],
    ['fb', 'flex justify-between'],
    ['fbc', 'flex justify-between items-center'],
    ['fa', 'flex justify-around'],
    ['fac', 'flex justify-around items-center'],
    ['fw', 'flex justify-wrap'],
    ['fwr', 'flex justify-wrap-reverse'],
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
  presets: [
    presetWind3(),
    presetAttributify(),
    presetIcons({
      cdn: 'https://esm.sh/',
      scale: 1.2,
      extraProperties: {
        display: 'inline-block',
        'vertical-align': 'text-bottom'
      }
    }),
    presetTypography(),
    presetWebFonts({
      fonts: {
        sans: 'Inter'
      },
      processors: createLocalFontProcessor()
    })
  ],
  transformers: [transformerDirectives(), transformerVariantGroup()]
})
