import { mergeConfig, type UserConfig } from "vite-plus";

const packageBaseConfig: UserConfig = {
  pack: {
    dts: {
      tsgo: true,
    },
    exports: true,
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {},
};

export function createPackageViteConfig(overrides: UserConfig = {}): UserConfig {
  return mergeConfig(packageBaseConfig, overrides);
}
