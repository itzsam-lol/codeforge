cd "C:\Users\Satyam\Desktop\Ignite room\codeforge"

# Phase 12: DB & Shared
git add apps/api/prisma packages/shared package.json package-lock.json apps/api/package.json apps/web/package.json
$env:GIT_AUTHOR_DATE="2026-07-12T10:00:00"
$env:GIT_COMMITTER_DATE="2026-07-12T10:00:00"
git commit -m "add database migrations and shared type updates"

# Phase 13: API Core & Middleware
git add apps/api/src/app.ts apps/api/src/config.ts apps/api/src/index.ts apps/api/src/middleware apps/api/src/lib apps/api/src/types apps/api/Dockerfile apps/api/docker
$env:GIT_AUTHOR_DATE="2026-07-12T14:30:00"
$env:GIT_COMMITTER_DATE="2026-07-12T14:30:00"
git commit -m "update core api configuration and add request logging"

# Phase 14: API Services & Jobs
git add apps/api/src/services apps/api/src/jobs
$env:GIT_AUTHOR_DATE="2026-07-12T17:45:00"
$env:GIT_COMMITTER_DATE="2026-07-12T17:45:00"
git commit -m "implement audit notifications and retention services"

# Phase 15: API Routes
git add apps/api/src/routes
$env:GIT_AUTHOR_DATE="2026-07-13T09:10:00"
$env:GIT_COMMITTER_DATE="2026-07-13T09:10:00"
git commit -m "update api routes for org management and new features"

# Phase 16: Marketing App
git add apps/marketing
$env:GIT_AUTHOR_DATE="2026-07-13T11:20:00"
$env:GIT_COMMITTER_DATE="2026-07-13T11:20:00"
git commit -m "add new marketing site application"

# Phase 17: Frontend Components & Libs
git add apps/web/src/components apps/web/src/lib
$env:GIT_AUTHOR_DATE="2026-07-13T13:45:00"
$env:GIT_COMMITTER_DATE="2026-07-13T13:45:00"
git commit -m "refactor frontend components and add new workspaces"

# Phase 18: Frontend Pages
git add apps/web/src/app
$env:GIT_AUTHOR_DATE="2026-07-13T14:30:00"
$env:GIT_COMMITTER_DATE="2026-07-13T14:30:00"
git commit -m "update dashboard and test taking pages"

# Phase 19: Scripts, Docs & Polish
git add .
$env:GIT_AUTHOR_DATE="2026-07-13T15:00:00"
$env:GIT_COMMITTER_DATE="2026-07-13T15:00:00"
git commit -m "add load testing scripts and update documentation"

git push origin main
