import { defineConfig } from 'vite-plus'
import { createPackageViteConfig } from '../../scripts/vite/config'

export default defineConfig(
  createPackageViteConfig({
    pack: {
      dts: true
    }
  })
)
