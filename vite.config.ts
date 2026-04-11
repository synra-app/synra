import { defineConfig } from "vite-plus";

const generatedIgnoreGlobs = [
  "**/node_modules/**",
  "**/dist/**",
  "apps/mobile/www/**",
  "apps/mobile/android/**",
];

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  fmt: {
    ignorePatterns: generatedIgnoreGlobs,
  },
  lint: {
    ignorePatterns: generatedIgnoreGlobs,
    options: { typeAware: true, typeCheck: true },
  },
  run: {
    cache: true,
  },
});
