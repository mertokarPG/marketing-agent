FROM node:24-bookworm-slim
ENV NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PUPPETEER_NO_SANDBOX=1
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium fonts-liberation fonts-noto-color-emoji fonts-noto-cjk ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
COPY packages/core/package.json packages/core/
RUN npm ci --omit=dev -w @carepost/worker -w @carepost/core
COPY packages/core packages/core
COPY apps/worker apps/worker
COPY supabase supabase
WORKDIR /app/apps/worker
# Run unprivileged; the worker writes scratch files under tmp/ (TMP_ROOT).
RUN mkdir -p tmp/runs && chown -R node:node /app/apps/worker/tmp
USER node
CMD ["npx", "tsx", "src/main.ts"]
