import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/clock.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  tsconfig: "tsconfig.build.json",
});
