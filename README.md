# Invoicer

**Server-side invoice audit** — match a buyer's title and tax ID against a batch of uploaded invoices, classify each as qualified / needs-review / unqualified, total up the compliant amounts, and email an audit report. PDFs are read by text extraction; only images go through on-device OCR.

Built with **Nuxt 4 · Vue 3 · TypeScript · TypeORM · SQLite · Tailwind v4 +
shadcn-vue**, deployable via **Docker Compose**.

---

## Features

### Today

- **Accounts** — email/password registration and login with secure sessions,
  powered by [Better Auth](https://better-auth.com). Every route is
  authenticated; `/login` and `/register` are public.
- **Organizations** — GitHub-style orgs via Better Auth's Organization plugin:
  create orgs, invite collaborators by email (48h invitations), manage members
  with owner / admin / member roles. Each user can also work in a personal
  scope.
- **OAuth sign-in** — GitHub and WeChat via Better Auth's **built-in** social
  providers (`socialProviders.github`, `socialProviders.wechat`). A provider is
  enabled only when its credentials are present, so the buttons appear only when
  configured. WeChat's web flow is non-standard (the authorize URL uses `appid`
  not `client_id` and a `#wechat_redirect` fragment; token/userinfo are
  GET-based; **no email** is returned, so users are matched by `unionId` /
  `openId`); Better Auth's provider handles all of this natively.
- **Account linking & merge** — sign in several ways under one account. Trusted
  providers auto-merge by shared email; an explicit **Account** page lets a
  logged-in user connect/disconnect GitHub and WeChat. Because Better Auth can't
  preserve an OAuth identity across an interrupted sign-in, merging is done while
  logged in — and a blocked link surfaces a friendly "log in first, then connect
  the provider" message instead of a raw error.
- **Reimbursement campaigns** — start an audit batch scoped to your **personal
  account** or to an **organization**. Personal campaigns are private to their
  owner; org campaigns are shared with every member of that org (your
  collaborators). Each campaign stores its expected buyer title + tax ID, a
  name, and its invoices, and can be resumed from the home page. The per-campaign
  workflow is three steps: set the title/tax → upload a folder of PDFs/images →
  review results. Access is enforced server-side on every endpoint.
- **Smart recognition**
  - PDFs → text extraction ([`unpdf`](https://github.com/HuguesLeloup/unpdf)).
    Scanned (text-less) PDFs are flagged for manual review rather than OCR'd.
  - Images → OCR via [`tesseract.js`](https://tesseract.projectnaptha.com/) with
    bundled `chi_sim` / `chi_tra` / `eng` language data. Runs entirely on the
    server — **no third-party OCR API**.
- **Matching** ported from the original system: title by containment, tax ID by
  exact match, amount from 价税合计 / 小写 (¥). Qualified = both match; partial
  or no-amount → needs manual review; neither → unqualified.
- **Manual review** for ambiguous invoices (optionally enter a missing amount).
- **Email audit reports** (HTML table + compliant total) via configurable SMTP.
- **Dark mode** (class-based, no-FOUC) and **i18n** (中文 / English).
- **Docker Compose** deployment with persistent volumes for the DB and uploads.

### Roadmap

The multi-tenant foundation — accounts, organizations, OAuth, and user/org-scoped
reimbursement campaigns — is in place. Likely next steps:

- **Email verification** — a real SMTP verification loop. Today every user is
  auto-verified (see the `databaseHooks` note in `server/utils/auth.ts`).
- **Role-aware campaigns** — restrict editing/removal of an org campaign to
  owners & admins. Today every org member can act on a campaign.

---

## Tech stack

| Layer     | Choice                                                                                                              |
| --------- | ------------------------------------------------------------------------------------------------------------------- |
| Framework | Nuxt 4 (SSR), Vue 3.5, TypeScript (strict)                                                                          |
| UI        | Tailwind CSS v4, shadcn-vue (reka-ui), lucide icons, vue-sonner toasts                                              |
| Database  | SQLite via `better-sqlite3`, accessed through TypeORM (`synchronize`)                                               |
| Auth      | [Better Auth](https://better-auth.com) (manual integration; email/password + sessions + GitHub/WeChat OAuth + orgs) |
| PDF / OCR | `unpdf` (text), `tesseract.js` (images, server-side)                                                                |
| Email     | `nodemailer`, SMTP config stored in the DB                                                                          |
| Tooling   | `tsup` (fast esbuild bundling for `scripts/`), `vue-tsc` type-checking                                              |
| Deploy    | Docker Compose                                                                                                      |

---

## Getting started

### Prerequisites

- Node.js ≥ 24, pnpm 11

### Development

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

Useful scripts:

```bash
pnpm build        # production Nuxt build
pnpm typecheck    # vue-tsc strict type-check
pnpm selftest     # domain-logic test (field extraction + matching)
pnpm tsup         # bundle scripts/*.ts (esbuild, ~10ms)
```

### Production with Docker Compose

```bash
docker compose up -d --build      # http://localhost:3000
```

The SQLite database and uploaded files are persisted via bind mounts
(`./data`, `./uploads`). Configure SMTP on the **Settings** page after first run.

---

## Configuration

Runtime configuration is via environment variables (see `docker-compose.yml`):

| Variable                                    | Default                   | Purpose                                                                                                                                                                                   |
| ------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DB_PATH`                                   | `./data/app.db`           | SQLite database path (shared by TypeORM + Better Auth)                                                                                                                                    |
| `UPLOADS_DIR`                               | `./uploads`               | Uploaded invoice storage                                                                                                                                                                  |
| `TESSDATA_DIR`                              | `./tessdata`              | OCR language data directory                                                                                                                                                               |
| `BETTER_AUTH_SECRET`                        | _(dev fallback)_          | Better Auth session/JWT secret — **must be ≥32 chars and set in prod**                                                                                                                    |
| `BETTER_AUTH_URL`                           | `$SITE_URL`               | Public origin Better Auth trusts for CSRF/OAuth checks                                                                                                                                    |
| `SESSION_SECRET`                            | `change-me-in-production` | Legacy session secret (reused as `BETTER_AUTH_SECRET` fallback)                                                                                                                           |
| `SITE_URL`                                  | _(empty)_                 | Public base URL (used in emails + as `BETTER_AUTH_URL`)                                                                                                                                   |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | _(empty)_                 | GitHub OAuth App credentials — enables "Sign in with GitHub". Callback URL: `${SITE_URL}/api/auth/callback/github`                                                                        |
| `WECHAT_APP_ID` / `WECHAT_APP_SECRET`       | _(empty)_                 | WeChat Open Platform app credentials — enables "Sign in with WeChat". Callback URL: `${SITE_URL}/api/auth/callback/wechat`. Users matched by `unionId`/`openId` (WeChat returns no email) |
| `PORT`                                      | `3000`                    | HTTP port                                                                                                                                                                                 |

OAuth providers are **optional** — each is enabled only when both its
credentials are set, and its sign-in button is hidden otherwise. GitHub needs a
[GitHub OAuth App](https://docs.github.com/en/apps/oauth-apps) with the
`user:email` scope; WeChat needs a [website-application
app](https://developers.weixin.qq.com/doc/oplatform/Website_App/WeChat_Login/Wechat_Login.html)
on the WeChat Open Platform with the 授权回调域 (authorized callback domain) set
to your `SITE_URL` host.

---

## Internationalization

UI strings live in **`i18n/locales/{zh,en}.json5`**. JSON5 is used (rather than
`.jsonc`) because it is the comment-capable JSON format `@nuxtjs/i18n` loads
natively — it supports `//` and `/* */` comments and trailing commas, so each
locale file stays self-documenting.

- Default locale: **中文 (`zh`)**, with **English (`en`)** available via the
  language switcher in the header.
- Strategy: `no_prefix` (no `/en/…` URL prefixes); the locale is remembered in a
  cookie and auto-detected from the browser on first visit.

To add a locale, drop a file in `i18n/locales/` and register it under `i18n` in
`nuxt.config.ts`.

---

## Project structure

```bash
app.vue                      # title template + Toaster + dark-mode sync
layouts/
  default.vue                # header (brand, account, settings, theme, language) + footer
  auth.vue                   # centered card layout for login / register
pages/
  index.vue                  # home: scope selector + new/resume campaigns + 3-step workflow
  settings.vue               # SMTP mail configuration
  account.vue                # profile + linked OAuth providers (connect/disconnect)
  organizations.vue          # org management (members, roles, invitations)
  login.vue / register.vue   # email/password + OAuth sign-in (Better Auth client)
components/
  ui/                        # shadcn-vue primitives (button, card, input, …)
  public/                    # Icon, ThemeToggle, LanguageSwitcher
  SiteFooter.vue
composables/
  useInvoice.ts              # reactive workflow state + API client
  useAuth.ts                 # Better Auth client (email/password, OAuth, linking)
  useOrgs.ts                 # organizations, members, invitations
  useOAuthProviders.ts       # which OAuth providers are configured server-side
middleware/
  auth.global.ts             # redirects unauthenticated users to /login
  guest.ts                   # keeps logged-in users out of /login, /register
plugins/auth.ts              # hydrates auth:user via /api/me + account_not_linked toast
utils/errors.ts              # human message extraction from $fetch errors
i18n/locales/                # zh.json5, en.json5
server/
  api/                       # Nitro routes (campaigns, invoices, mail, auth, …)
  api/campaign.post.ts       # create a campaign (personal or org-scoped)
  api/campaigns.get.ts       # list accessible campaigns (personal + member orgs)
  api/campaigns/[id]/…       # per-campaign invoices / upload / review / report / clear
  api/auth/[...all].ts       # Better Auth handler mount (sign-in/up/out, orgs, OAuth)
  api/me.get.ts              # current session user
  api/oauth-providers.get.ts # reports enabled OAuth providers for the login UI
  entities/                  # TypeORM entities (campaign, invoice, mailConfig, appSetting)
  utils/auth.ts              # Better Auth instance (self-contained for the CLI)
  utils/campaign.ts          # session + campaign access control (owner / org member)
  utils/                     # database, mail, extract, ocr, fields, match, …
  plugins/01.db.ts           # TypeORM initialization
shared/                      # type-only types shared by client + server
scripts/selftest.ts          # bundled by tsup; domain-logic test
tessdata/                    # OCR language models (bundled, not downloaded)
```

---

## How matching works

`server/utils/fields.ts` extracts the title, tax ID, and amount from raw text
(the same regex strategy as the original Python service).
`server/utils/match.ts` then classifies each invoice:

| Condition                                              | Status        | In total? |
| ------------------------------------------------------ | ------------- | --------- |
| Title **and** tax ID match, amount found               | `qualified`   | ✅        |
| Title/tax match but **no amount**, or only one matches | `review`      | manual    |
| Neither matches                                        | `unqualified` | ❌        |

Run `pnpm selftest` to exercise this against synthetic invoices.

---

## License

Private / internal.
