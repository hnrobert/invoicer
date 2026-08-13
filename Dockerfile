FROM node:24-slim AS base
RUN corepack enable
WORKDIR /app

# --- deps ---
FROM base AS deps
# build-essential + python3: better-sqlite3 ships node-24 prebuilds (so this is
# usually unused), but keep the toolchain so a missing prebuild falls back to a
# source compile instead of failing the whole image build.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# --- build ---
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build
# Nitro externalizes tesseract.js-core and copies its .js into the bundled
# node_modules, but NOT the .wasm binaries the core loads at runtime — OCR would
# ENOENT on the wasm. Copy them next to the .js so OCR works in the image.
RUN mkdir -p .output/server/node_modules/tesseract.js-core && \
    find node_modules -path '*tesseract.js-core*' -name '*.wasm' \
      -exec cp -fL {} .output/server/node_modules/tesseract.js-core/ \;

# --- production ---
FROM node:24-slim AS production
RUN apt-get update && apt-get install -y --no-install-recommends fontconfig fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY --from=build /app/.output ./.output
COPY --from=build /app/package.json ./package.json
# OCR language data (chi_sim / chi_tra / eng), served locally — no API download.
COPY --from=build /app/tessdata ./tessdata

# better-sqlite3 native binary lives in .output (bundled by Nitro).
RUN mkdir -p /app/data /app/uploads

ENV NODE_ENV=production
ENV DB_PATH=/app/data/app.db
ENV UPLOADS_DIR=/app/uploads
ENV TESSDATA_DIR=/app/tessdata
ENV HOST=0.0.0.0
ENV PORT=3000
EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
