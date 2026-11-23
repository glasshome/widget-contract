import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/clock.ts",
    "src/i18n.ts",
    "src/i18n-format.ts",
    "src/catalog-build.ts",
    "src/catalog-reserved.ts",
    "src/state-texts.ts",
    "src/sdk-floor.ts",
    "src/dash-releases.ts",
    "src/state.ts",
  ],
  format: ["esm"],
  dts: true,
  clean: true,
  tsconfig: "tsconfig.build.json",
});
