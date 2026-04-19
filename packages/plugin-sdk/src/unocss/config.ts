import { defineConfig, presetIcons, presetWind3 } from 'unocss'

export const synraUnoConfig = defineConfig({
  presets: [presetWind3(), presetIcons()]
})
