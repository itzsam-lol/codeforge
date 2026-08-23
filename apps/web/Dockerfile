# CodeForge web image (docker-compose "app" profile).
FROM node:20-bookworm-slim

WORKDIR /repo
COPY . .

# next.config.mjs's rewrites() bakes this destination into the build output
# (.next/routes-manifest.json) at `next build` time — docker-compose's
# runtime `environment: API_ORIGIN` (below, for anything else that reads
# process.env at request time) arrives too late to affect it, so it must
# also be set here, before the build step, matching the actual internal
# docker network hostname this Dockerfile is always built to run behind.
ENV API_ORIGIN=http://api:4000
RUN npm ci && npm run build -w @codeforge/web

ENV NODE_ENV=production
WORKDIR /repo/apps/web
EXPOSE 3000
CMD ["npm", "run", "start"]
