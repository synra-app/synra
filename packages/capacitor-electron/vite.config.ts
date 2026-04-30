import { createPackageViteConfig } from '../../scripts/vite/config.ts'

export default createPackageViteConfig({
  pack: {
    entry: {
      index: './src/index.ts',
      plugin: './src/plugin/index.ts',
      capacitor: './src/capacitor/index.ts'
    },
    dts: {
      tsgo: false
    },
    exports: {
      devExports: true
    }
  }
})
