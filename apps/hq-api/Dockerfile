# CodeForge HQ API image (docker-compose "hq" profile).
FROM node:20-bookworm-slim

RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /repo
COPY . .

RUN npm ci \
  && npx -w @codeforge/hq-api prisma generate \
  && npm run build -w @codeforge/hq-api

ENV NODE_ENV=production
WORKDIR /repo/apps/hq-api

CMD ["node", "dist/index.js"]
