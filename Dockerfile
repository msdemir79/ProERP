# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# 1) Derleme aşaması: bağımlılıklar + Vite/ sunucu derlemesi (dist/)
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# ---------------------------------------------------------------------------
# 2) Çalışma aşaması: yalnızca üretim bağımlılıkları ve derlenmiş dosyalar
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY db ./db
COPY scripts/start.mjs scripts/db-setup.mjs scripts/db-migrate.mjs scripts/docker-entrypoint.mjs ./scripts/

# Yüklenen görseller için kalıcı dizin (docker-compose'da volume'a bağlanır).
# Named volume ilk oluşturulduğunda bu dizinin sahipliği devralınır.
RUN mkdir -p /data/uploads \
  && touch /data/uploads/.keep .env \
  && chown -R node:node /data/uploads .env

USER node
EXPOSE 3000
CMD ["node", "scripts/docker-entrypoint.mjs"]
