import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  minify: false,
  shims: true,
  splitting: true,
  sourcemap: true,
  treeshake: true,
  banner: {
    js: "#!/usr/bin/env node",
  },
});
