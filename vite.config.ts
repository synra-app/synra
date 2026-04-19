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
    'apps/**/src/**/*.{ts,vue,scss}': ['vp fmt', 'vp lint --fix', 'vp check --fix'],
    'packages/**/*.{ts,vue}': ['vp fmt', 'vp lint --fix', 'vp check --fix']
  },
  run: {
    cache: true
  }
})
