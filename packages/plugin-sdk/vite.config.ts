import { defineConfig } from "vite-plus";
import { createPackageViteConfig } from "../../scripts/vite/config";

export default defineConfig(
  createPackageViteConfig({
    pack: {
      entry: ["src/index.ts", "src/vite.ts"],
      exports: {
        devExports: true,
      },
      dts: {
        tsgo: false,
      },
    },
  }),
);
