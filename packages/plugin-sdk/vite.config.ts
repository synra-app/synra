import { createPackageViteConfig } from '../../scripts/vite/config.ts'

export default createPackageViteConfig({
  pack: {
    entry: {
      index: './src/index.ts',
      vite: './src/vite/index.ts',
      hooks: './src/hooks/index.ts',
      unocss: './src/unocss/index.ts'
    },
    exports: {
      devExports: true
    },
    dts: {
      tsgo: false
    }
  }
})
