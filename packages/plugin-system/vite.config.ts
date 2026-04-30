import { createPackageViteConfig } from '../../scripts/vite/config.ts'

export default createPackageViteConfig({
  pack: {
    entry: {
      index: './src/index.ts',
      node: './src/node.ts'
    },
    exports: {
      devExports: true
    },
    dts: {
      tsgo: false
    }
  }
})
