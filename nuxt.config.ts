import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";

// The email body HTML comes from the email-poster preset templates
// (server/mail/theme.ts). Only the site logo is baked here: read at
// config-eval time and passed to the server via runtimeConfig as a base64
// data URI so it renders in every client without external fetches.
const emailLogo = `data:image/svg+xml;base64,${Buffer.from(
  readFileSync(fileURLToPath(new URL("./public/favicon.svg", import.meta.url))),
).toString("base64")}`;

// Nuxt 4 full-stack config. The invoice audit UI is SSR-rendered; sessions,
// uploads, OCR/extraction and mail run as Nitro server routes.
export default defineNuxtConfig({
  compatibilityDate: "2026-07-13",
  devtools: { enabled: true },
  ssr: true,
  // Flat (Nuxt 3-style) layout: pages/components/layouts/… live at the project
  // root alongside app.vue, not under an app/ dir.
  srcDir: ".",
  // Default dev port (pnpm dev); production uses PORT (Dockerfile/compose set 10752).
  devServer: { port: 10752 },

  // vue-sonner: registers the client-only <Toaster> and auto-imports `toast`.
  // @nuxtjs/i18n: zh/en UI strings (locale files in i18n/locales/*.json5 — JSON5 is
  // the comment-capable JSON variant the module loads natively, standing in for JSONC).
  modules: ["vue-sonner/nuxt", "@nuxtjs/i18n"],
  imports: { presets: [{ from: "vue-sonner", imports: ["toast"] }] },

  // Tailwind v4 + shadcn theme CSS (monochrome GitHub-like design system).
  css: ["~/assets/css/main.css"],
  vite: {
    plugins: [tailwindcss()],
    build: {
      rolldownOptions: {
        // PLUGIN_TIMINGS is informational only — Nuxt's resolveId hooks and
        // Tailwind's CSS generation legitimately dominate a build this size,
        // so the warning is noise rather than an actionable signal.
        checks: { pluginTimings: false },
      },
    },
    optimizeDeps: {
      include: [
        "@vueuse/core",
        "class-variance-authority",
        "clsx",
        "lucide-vue-next",
        "tailwind-merge",
      ],
      // email-poster's ./vue entry is raw .vue source, which esbuild can't
      // pre-bundle — exclude it and let the Vue plugin transform it.
      exclude: ["email-poster"],
    },
  },

  // Auto-import components by filename (no path prefix) so shadcn-vue <Button>,
  // <Card>, … and public <Icon> resolve without explicit imports. Only scan .vue.
  components: [
    { path: "~/components", pathPrefix: false, extensions: [".vue"] },
  ],

  // i18n: Chinese (default) + English. `no_prefix` keeps all routes prefix-free (so
  // /api/* and future /api/auth/* are untouched); the locale is remembered in a
  // cookie and auto-detected from the browser on first visit. Locale strings live
  // in i18n/locales/{zh,en}.json5.
  i18n: {
    strategy: "no_prefix",
    defaultLocale: "zh",
    locales: [
      // `name` is serialized into the client payload (never displayed — the
      // account page renders labels via the lang.* i18n keys), so keep it
      // ASCII to satisfy "no Chinese anywhere in the English payload".
      { code: "zh", language: "zh-CN", name: "Chinese", file: "zh.json5" },
      { code: "en", language: "en-US", name: "English", file: "en.json5" },
    ],
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: "invoicer_i18n",
      redirectOn: "root",
      fallbackLocale: "zh",
    },
  },

  runtimeConfig: {
    sessionSecret: process.env.SESSION_SECRET || "dev-secret-change-me",
    dbPath: process.env.DB_PATH || "./data/app.db",
    uploadsDir: process.env.UPLOADS_DIR || "./uploads",
    siteUrl: process.env.SITE_URL || "",
    emailLogo,
  },

  // No-FOUC dark mode: apply the saved/system theme synchronously in <head>
  // before first paint (matches @vueuse useColorMode's vg.theme key + logic).
  app: {
    head: {
      link: [
        {
          key: "favicon",
          rel: "icon",
          type: "image/svg+xml",
          href: "/favicon.svg",
        },
      ],
      script: [
        {
          tagPosition: "head",
          innerHTML:
            "(function(){try{var s=localStorage.getItem('vg.theme');" +
            "var d=s==='dark'||((s==='auto'||!s)&&matchMedia('(prefers-color-scheme: dark)').matches);" +
            'if(d)document.documentElement.classList.add("dark");}catch(e){}})();',
        },
      ],
    },
  },

  typescript: {
    strict: true,
    tsConfig: {
      compilerOptions: {
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
      },
    },
  },

  // TypeORM decorator support for the Nitro server (esbuild tsconfigRaw).
  // Without this the @Column metadata is emitted as plain String/Number and
  // TypeORM infers the wrong column type at runtime.
  nitro: {
    esbuild: {
      options: {
        tsconfigRaw: JSON.stringify({
          compilerOptions: {
            experimentalDecorators: true,
            emitDecoratorMetadata: true,
          },
        }),
      },
    },
  },

  future: { compatibilityVersion: 4 },
});
