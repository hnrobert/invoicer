import { defineConfig } from 'tsup'

// tsup (esbuild) compiles the standalone tooling/CLI scripts under scripts/ far
// faster than running them through tsx each time, and decouples them from the
// Nuxt build. The main Nuxt/Nitro app is ALREADY bundled by esbuild via Nitro,
// so tsup is only used here for auxiliary Node CLIs (selftest, seed, ocr-cli) —
// not to replace `nuxt build`.
export default defineConfig({
  entry: ['scripts/*.ts'],
  outDir: 'dist/scripts',
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
  sourcemap: true,
  clean: true,
})
