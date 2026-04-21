import { defineConfig } from 'vite-plus'

export default defineConfig({
  pack: {
    dts: {
      tsgo: true
    },
    exports: true
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true
    }
  },
  fmt: {
    singleQuote: true,
    semi: false,
    trailingComma: 'none'
  },
  staged: {
    // vp lint only targets JS/TS/Vue; SCSS would yield "No files found" and fail the hook.
    'apps/**/src/**/*.{ts,vue}': ['vp fmt', 'vp lint --fix', 'vp check --fix'],
    'apps/**/src/**/*.scss': ['vp fmt', 'vp check --fix'],
    'packages/**/*.{ts,vue}': ['vp fmt', 'vp lint --fix', 'vp check --fix']
  },
  run: {
    cache: true
  }
})
