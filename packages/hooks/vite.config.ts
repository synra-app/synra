import { createPackageViteConfig } from '../../scripts/vite/config.ts'

export default createPackageViteConfig({
  pack: {
    entry: {
      index: './src/index.ts',
      electron: './src/electron.ts',
      envelope: './src/envelope/index.ts'
    },
    exports: {
      devExports: true
    },
    dts: {
      tsgo: false
    }
  }
})
