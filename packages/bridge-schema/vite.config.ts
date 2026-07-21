import { mergeConfig } from 'vite-plus'
import { createPackageViteConfig } from '../../scripts/vite/config.ts'

export default mergeConfig(createPackageViteConfig(), {
  pack: {
    dts: {
      // Keep these as external type imports in the emitted d.mts instead of
      // inlining their full bodies. Without this, downstream consumers
      // (e.g. capacitor-clipboard) end up with multi-megabyte d.mts files
      // and tsgo's dts graph walk traverses those packages' source trees,
      // which then fails when the source has unresolved cross-package type
      // imports of its own.
      neverBundle: ['@synra/protocol', '@synra/plugin-sdk', '@synra/plugin-system']
    }
  }
})
