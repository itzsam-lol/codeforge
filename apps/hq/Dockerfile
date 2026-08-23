# CodeForge HQ web image (docker-compose "hq" profile).
FROM node:20-bookworm-slim

WORKDIR /repo
COPY . .

# next.config.mjs's rewrites() bakes this destination into the build output
# at `next build` time — docker-compose's runtime `environment: HQ_API_ORIGIN`
# arrives too late to affect it, so it must also be set here, before the
# build step (see apps/web/Dockerfile's identical comment/fix).
ENV HQ_API_ORIGIN=http://hq-api:4100
RUN npm ci && npm run build -w @codeforge/hq

ENV NODE_ENV=production
WORKDIR /repo/apps/hq
EXPOSE 3100
CMD ["npm", "run", "start"]
