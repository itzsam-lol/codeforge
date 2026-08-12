# CodeForge HQ web image (docker-compose "hq" profile).
FROM node:20-bookworm-slim

WORKDIR /repo
COPY . .

RUN npm ci && npm run build -w @codeforge/hq

ENV NODE_ENV=production
WORKDIR /repo/apps/hq
EXPOSE 3100
CMD ["npm", "run", "start"]
