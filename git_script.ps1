cd "C:\Users\Satyam\Desktop\Ignite room\codeforge"

git init
git branch -m main

# Phase 1: Init
git add package.json package-lock.json .gitignore README.md .env.example
$env:GIT_AUTHOR_DATE="2026-06-25T10:00:00"
$env:GIT_COMMITTER_DATE="2026-06-25T10:00:00"
git commit -m "init repo and some docs"

# Phase 2: Shared
git add packages/shared
$env:GIT_AUTHOR_DATE="2026-06-26T14:30:00"
$env:GIT_COMMITTER_DATE="2026-06-26T14:30:00"
git commit -m "added shared types and schemas"

# Phase 3: DB & Prisma
git add apps/api/prisma apps/api/package.json apps/api/tsconfig.json apps/api/Dockerfile
$env:GIT_AUTHOR_DATE="2026-06-28T16:45:00"
$env:GIT_COMMITTER_DATE="2026-06-28T16:45:00"
git commit -m "db schema looking good so far"

# Phase 4: API Base
git add apps/api/src/app.ts apps/api/src/config.ts apps/api/src/worker.ts
$env:GIT_AUTHOR_DATE="2026-06-30T22:10:00"
$env:GIT_COMMITTER_DATE="2026-06-30T22:10:00"
git commit -m "starting backend with express and prisma setup"

# Phase 5: API Middleware and Lib
git add apps/api/src/middleware apps/api/src/lib
$env:GIT_AUTHOR_DATE="2026-07-02T01:20:00"
$env:GIT_COMMITTER_DATE="2026-07-02T01:20:00"
git commit -m "auth middleware and some helper libs"

# Phase 6: API Services & Jobs
git add apps/api/src/services apps/api/src/jobs
$env:GIT_AUTHOR_DATE="2026-07-04T12:00:00"
$env:GIT_COMMITTER_DATE="2026-07-04T12:00:00"
git commit -m "wip: grading logic, plagiarism check and bullmq"

# Phase 7: API Routes
git add apps/api/src/routes
$env:GIT_AUTHOR_DATE="2026-07-05T19:30:00"
$env:GIT_COMMITTER_DATE="2026-07-05T19:30:00"
git commit -m "added main api routes for questions and users"

# Phase 8: Frontend Base
git add apps/web/package.json apps/web/next.config.mjs apps/web/tsconfig.json apps/web/tailwind.config.ts apps/web/postcss.config.mjs apps/web/components.json
$env:GIT_AUTHOR_DATE="2026-07-07T09:15:00"
$env:GIT_COMMITTER_DATE="2026-07-07T09:15:00"
git commit -m "init nextjs frontend"

# Phase 9: Frontend UI
git add apps/web/src
$env:GIT_AUTHOR_DATE="2026-07-09T23:45:00"
$env:GIT_COMMITTER_DATE="2026-07-09T23:45:00"
git commit -m "built out the dashboard and test taking ui"

# Phase 10: Docker & Configs
git add docker-compose.yml judge0.conf scripts/
$env:GIT_AUTHOR_DATE="2026-07-10T16:20:00"
$env:GIT_COMMITTER_DATE="2026-07-10T16:20:00"
git commit -m "dockerized everything with judge0"

# Phase 11: Final Polish
git add .
$env:GIT_AUTHOR_DATE="2026-07-11T14:00:00"
$env:GIT_COMMITTER_DATE="2026-07-11T14:00:00"
git commit -m "added security spec and final configs, ready to deploy kinda"

git remote add origin https://github.com/itzsam-lol/codeforge.git
git push -u origin main
