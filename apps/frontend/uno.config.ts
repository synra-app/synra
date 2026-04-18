import { createLocalFontProcessor } from "@unocss/preset-web-fonts/local";
import { unoColors } from "uno-colors";
import {
  defineConfig,
  presetAttributify,
  presetIcons,
  presetTypography,
  presetWebFonts,
  presetWind3,
  transformerDirectives,
  transformerVariantGroup,
} from "unocss";

const breakpoints = {
  xs: "320px",
  sm: "480px",
  md: "768px",
  lg: "1024px",
  xl: "1280px",
  "2xl": "1536px",
  "3xl": "1920px",
};

export default defineConfig({
  content: {
    filesystem: ["src/**/*.{vue,ts,tsx,js,jsx,html,css,scss}", "index.html"],
    pipeline: {
      include: [/[\\/]src[\\/].*\.(vue|ts|tsx|js|jsx|html|css|scss)($|\?)/, /[\\/]index\.html$/],
      exclude: [/[\\/]node_modules[\\/]/, /[\\/]\.auto-generated[\\/]/, /[\\/]dist[\\/]/],
    },
  },
  theme: {
    colors: unoColors({
      primary: "#64cc96",
      success: "#22c55e",
      warning: "#f59e0b",
      error: "#ef4444",
      info: "#0ea5e9",
      surface: "#ffffff",
      muted: "#475569",
    }),
    breakpoints,
  },
  shortcuts: [
    [/^clickable(-.*)?$/, ([, scale]) => `cursor-pointer transition active:scale${scale || "-95"}`],
    ["bg-colorful", "bg-gradient-to-tr from-[#bd34fe] to-[#47caff]"],
    ["text-colorful", "bg-colorful text-transparent bg-clip-text"],
    ["pr", "relative"],
    ["pa", "absolute"],
    ["pf", "fixed"],
    ["ps", "sticky"],
    ["pxc", "pa left-1/2 -translate-x-1/2"],
    ["pyc", "pa top-1/2 -translate-y-1/2"],
    ["pcc", "pxc pyc"],
    ["fcc", "flex justify-center items-center"],
    ["fccc", "fcc flex-col"],
    ["fxc", "flex justify-center"],
    ["fyc", "flex items-center"],
    ["fs", "flex justify-start"],
    ["fsc", "flex justify-start items-center"],
    ["fse", "flex justify-start items-end"],
    ["fe", "flex justify-end"],
    ["fec", "flex justify-end items-center"],
    ["fb", "flex justify-between"],
    ["fbc", "flex justify-between items-center"],
    ["fa", "flex justify-around"],
    ["fac", "flex justify-around items-center"],
    ["fw", "flex justify-wrap"],
    ["fwr", "flex justify-wrap-reverse"],
  ],
  presets: [
    presetWind3(),
    presetAttributify(),
    presetIcons({
      cdn: "https://esm.sh/",
      scale: 1.2,
      extraProperties: {
        display: "inline-block",
        "vertical-align": "text-bottom",
      },
    }),
    presetTypography(),
    presetWebFonts({
      fonts: {
        sans: "Inter",
      },
      processors: createLocalFontProcessor(),
    }),
  ],
  transformers: [transformerDirectives(), transformerVariantGroup()],
});
