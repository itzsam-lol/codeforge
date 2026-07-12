# CodeForge API / worker image (used by the docker-compose "app" profile).
# Not layer-optimized yet; Phase 5 (hardening) will split build/runtime stages.
FROM node:20-bookworm-slim

RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /repo
COPY . .

RUN npm ci \
  && npx -w @codeforge/api prisma generate \
  && npm run build -w @codeforge/api

ENV NODE_ENV=production
WORKDIR /repo/apps/api

# The compose file overrides CMD for the worker container (node dist/worker.js)
CMD ["node", "dist/index.js"]
