FROM node:24-slim AS base
RUN corepack enable
WORKDIR /app

# --- deps ---
# No apt toolchain: everything (exceljs / adm-zip / tesseract.js / pg) is pure
# JS/WASM — no native modules in production.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# The postinstall hook runs this script — copy it before install.
COPY scripts/fetch-tessdata.ts scripts/fetch-tessdata.ts
# postinstall auto-fetches tessdata (tolerant); enforce strictness for the
# image — an OCR-less build must fail loudly.
RUN TESSDATA_STRICT=1 pnpm install --frozen-lockfile

# --- build ---
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build
# Nitro externalizes tesseract.js-core and copies its .js into the bundled
# node_modules, but NOT the .wasm binaries the core loads at runtime — OCR would
# ENOENT on the wasm. Copy them next to the .js so upload/OCR works in the image.
RUN mkdir -p .output/server/node_modules/tesseract.js-core && \
    find node_modules -path '*tesseract.js-core*' -name '*.wasm' \
      -exec cp -fL {} .output/server/node_modules/tesseract.js-core/ \;

# --- production ---
# No apt packages either: tesseract.js is pure WASM and reads its language data
# from ./tessdata, so fontconfig/system fonts aren't needed.
FROM node:24-slim AS production
WORKDIR /app

COPY --from=build /app/.output ./.output
COPY --from=build /app/package.json ./package.json
# OCR language data, fetched by postinstall in the deps stage (strict mode) —
# take it from there, not from the build context (CI checkouts have no
# tessdata on disk; `COPY . .` in the build stage can't provide it).
COPY --from=deps /app/tessdata ./tessdata

RUN mkdir -p /app/uploads

ENV NODE_ENV=production
ENV UPLOADS_DIR=/app/uploads
ENV TESSDATA_DIR=/app/tessdata
ENV HOST=0.0.0.0
ENV PORT=10752
EXPOSE 10752

CMD ["node", ".output/server/index.mjs"]
