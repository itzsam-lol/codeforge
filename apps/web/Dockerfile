# CodeForge web image (docker-compose "app" profile).
FROM node:20-bookworm-slim

WORKDIR /repo
COPY . .

RUN npm ci && npm run build -w @codeforge/web

ENV NODE_ENV=production
WORKDIR /repo/apps/web
EXPOSE 3000
CMD ["npm", "run", "start"]
