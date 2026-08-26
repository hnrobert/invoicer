// ESLint flat config for TypeScript projects.
// Division of labor: ESLint owns code quality, Prettier owns formatting
// (see .prettierrc in the same directory) — do not add formatting rules here.
// Dev dependencies: pnpm add -D eslint @eslint/js typescript-eslint globals
//
// Nuxt note: .vue SFCs are excluded until eslint-plugin-vue is adopted (they
// are fully covered by `vue-tsc` typecheck + Prettier); server/client
// auto-import globals (defineEventHandler, …) resolve via .nuxt/types.d.ts.
// no-undef is off: TS files are type-checked by `pnpm typecheck`, and the
// runtime globals below cover the few plain-JS escape hatches.
//
// `defineConfig` comes from ESLint core (eslint/config) — the variadic
// `tseslint.config()` helper is deprecated now that core provides it.
import { defineConfig } from "eslint/config";
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default defineConfig(
  {
    ignores: [
      "**/*.vue",
      ".nuxt/**",
      ".output/**",
      "node_modules/**",
      "dist/**",
      "ref/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: { "no-undef": "off" },
  },
);
