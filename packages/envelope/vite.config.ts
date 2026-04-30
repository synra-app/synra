import { createPackageViteConfig } from '../../scripts/vite/config.ts'

export default createPackageViteConfig({
  pack: {
    exports: {
      devExports: true
    },
    dts: {
      tsgo: false
    }
  }
})
