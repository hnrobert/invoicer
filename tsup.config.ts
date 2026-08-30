import { defineConfig } from "tsup";

// tsup (esbuild) compiles the standalone tooling/CLI scripts under scripts/ far
// faster than running them through tsx each time, and decouples them from the
// Nuxt build. The main Nuxt/Nitro app is ALREADY bundled by esbuild via Nitro,
// so tsup is only used here for auxiliary Node CLIs (selftest, seed, ocr-cli) —
// not to replace `nuxt build`.
export default defineConfig({
  entry: ["scripts/*.ts"],
  outDir: "dist/scripts",
  format: ["esm"],
  target: "node24",
  platform: "node",
  // TypeORM entities use legacy decorators; every column declares an explicit
  // type so emitDecoratorMetadata is unnecessary (gateway pattern).
  tsconfig: "tsup.tsconfig.json",
  banner: {
    js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
  },
  sourcemap: true,
  clean: true,
});
