# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

FROM base AS build
# Native SQLite can use a prebuild or compile for the Linux target.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --include=dev \
    && node -e 'const Database = require("better-sqlite3"); new Database(":memory:").close(); require("sharp");'
COPY . .
# Fail the build if the Git checkout omitted an ignored but required demo asset.
RUN node docs/verify-deploy-assets.mjs
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production \
    PORT=10000 \
    SEAM_DATA_DIR=/var/data/seam \
    SEAM_DEFAULT_MODE=preview \
    SEAM_FORCE_PROVIDER=local \
    FFMPEG_PATH=/usr/bin/ffmpeg \
    FFPROBE_PATH=/usr/bin/ffprobe \
    MALLOC_ARENA_MAX=2
# Keep TypeScript: next start reads the existing next.config.ts at runtime.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json /app/package-lock.json /app/next.config.ts /app/tsconfig.json ./
COPY --from=build /app/src/core/config.ts ./src/core/config.ts
COPY --from=build /app/src/lib/server/offsite-backup.ts ./src/lib/server/offsite-backup.ts
COPY --from=build /app/scripts/_env.ts /app/scripts/backup-offsite.ts ./scripts/
# Verify the documented operator command resolves in the actual runtime image.
RUN node --import tsx scripts/backup-offsite.ts --help
RUN mkdir -p /var/data/seam
EXPOSE 10000
CMD ["sh", "-c", "exec node node_modules/next/dist/bin/next start --hostname 0.0.0.0 --port ${PORT:-10000}"]
