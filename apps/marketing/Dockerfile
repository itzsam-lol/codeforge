# CodeForge marketing site + Arena image (docker-compose "app" profile).
FROM node:20-bookworm-slim

WORKDIR /repo
COPY . .

# next.config.mjs's rewrites() bakes this destination into the build output
# (.next/routes-manifest.json) at `next build` time — the runtime
# `environment: ARENA_API_ORIGIN` (docker-compose.yml, for anything else
# that reads process.env at request time) arrives too late to affect it, so
# it must also be set here, before the build step. Mirrors apps/web/Dockerfile's
# identical API_ORIGIN gotcha.
ENV ARENA_API_ORIGIN=http://api:4000
RUN npm ci && npm run build -w @codeforge/marketing

ENV NODE_ENV=production
WORKDIR /repo/apps/marketing
# package.json's start script hardcodes -p 3200 (matches the redirect
# URIs/JS origins already registered on the Google/GitHub OAuth apps used
# for Arena sign-in — see .env.example's ARENA_GOOGLE_CLIENT_ID comment).
EXPOSE 3200
CMD ["npm", "run", "start"]
