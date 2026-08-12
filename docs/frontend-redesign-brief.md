# CodeForge — Frontend Redesign Brief

*For a designer (human or AI) taking on a full visual redesign of the product. This document is the single source of truth: what the product is, who uses it, every screen that exists, every API endpoint each screen can draw on, and the constraints the redesign has to work within. Read it end to end before proposing anything — most of the hard product questions are already answered below.*

---

## 1. What CodeForge is

CodeForge is a **self-hosted, white-label technical assessment platform for app-development hiring** — think "Workday, but for running a coding interview": a company deploys their *own* instance, invites candidates via an expiring link, candidates take a proctored coding/MCQ/etc. test in the browser, and the hiring team reviews auto-scored results. The whole product is built to be resold as **one branded deployment per client** — a client's own logo, name, and accent color end up on every screen, including the ones candidates see. There is no multi-tenant SaaS layer and no public signup; onboarding a new client is a config change, not a code change.

The product ships as three separate web apps:

| Surface | Audience | Job |
|---|---|---|
| **Marketing site** | A hiring company evaluating whether to buy | Persuade + explain, drive to "book a demo" |
| **Recruiter dashboard** | The hiring team (recruiters, admins, reviewers) | A daily-use internal tool: build tests, invite candidates, review results |
| **Candidate flow** | Job applicants | A timed, proctored exam experience — has to feel calm, fair, and trustworthy, not like a surveillance product |

These three need to read as **one product family** (shared type/color/motion language) while each is tuned for its own job — a sales page earns more visual energy than an exam screen.

---

## 2. Who's using each surface, and what they need from it

- **Recruiter / super_admin** — builds the question bank, assembles tests, invites candidates, reviews results, sets branding. Works in this tool for hours at a stretch across a hiring round. Needs density, speed, and low visual noise — this is a spreadsheet-replacement tool, not a showcase.
- **Reviewer** — read-only across the org; scores candidates against a rubric and leaves notes. Same dashboard, narrower permissions.
- **Candidate** — a job applicant, often nervous, sometimes on unfamiliar or lower-spec hardware, doing this once. Every screen before the test starts needs to *reduce* anxiety: explain exactly what's being recorded and why before asking for a permission. Nothing should look punitive — proctoring signals are explicitly "for human review, never a verdict," and the UI has to carry that tone, not just say it once in a tooltip.
- **The hiring company itself** — invisible in the UI, but its brand is the one candidates actually see once white-labeling is on (`hideCodeForgeBranding: true`, custom logo/accent/name everywhere). The design system has to be *built* around a swappable accent, not have one hardcoded in.

---

## 3. Current state — what already exists

The product functionally ships all of the below already (six question types, proctoring, plagiarism detection, analytics, export, branding). A prior design pass already did a baseline cleanup — removed gradient/glassmorphism/hover-lift "AI-generated" patterns, standardized on a Vercel/Linear-style minimal direction — so this is **not a blank canvas**, and the redesign should treat the current state as a genuine v1 to raise, not a mess to gut. Current baseline tokens, for reference (a real redesign should feel free to replace these, but they're the starting contract):

- **Type scale** (rem): 0.75 / 0.875 / 1 / 1.125 / 1.25 / 1.5 / 1.875 / 2.25 / 3, on Inter (UI) + JetBrains Mono (code).
- **Spacing**: Tailwind's default 4px-based scale, used consistently.
- **Radius**: exactly two steps — 6px on controls (buttons/inputs/badges), 12px on containers (cards/modals). `rounded-full` reserved for pills/avatars.
- **Elevation**: a 1px border on resting surfaces; shadow reserved for things that float above the page (modals, dropdowns) — no shadow-on-hover, no colored glow.
- **Motion**: three durations (120/180/260ms), ease-out for entrances / ease-in for exits, `prefers-reduced-motion` respected everywhere.
- **Color**: one CSS-variable accent pair (`--color-accent` / `--color-accent-hover`, default indigo `#4f46e5`) driving every brand-identifying element, plus a light-mode neutral ramp for the recruiter dashboard and a separate near-black ramp for the candidate flow (`[data-theme="recruiter"]` vs `[data-theme="candidate"]`, a deliberate brand-mode split, not a light/dark preference toggle).
- **Known gap**: the candidate-facing flow is fully accent-themed; the recruiter dashboard's *internal* chrome (buttons, badges, tab underlines) is not yet — it's still a fixed accent color rather than reading from the org's `accentColor`. This is real, open work for the redesign to pick up, not something already solved.
- **Accessibility baseline**: an automated WCAG A/AA scan currently reports 0 violations across every recruiter page and the candidate flow. Do not regress this.
- **Performance baseline**: Monaco (the code editor) is self-hosted rather than CDN-loaded, and each candidate workspace type is code-split so a candidate only downloads the editor experience for the question type they're actually on. Candidates use whatever hardware they own — this is a hard constraint on how much JS-driven animation the redesign can add, especially near the editor pane.

---

## 4. Complete page inventory

### 4a. Recruiter dashboard (desktop-first internal tool; sidebar nav: Dashboard / Question bank / Tests / Activity / Settings)

| Route | What's on it |
|---|---|
| `/login` | Staff sign-in (email/password), branded with org logo/name |
| `/dashboard` | 6 stat cards (Tests, Published, Questions in bank, Candidates invited, In progress now, Completed) + a recent-tests table |
| `/questions` | Filterable/searchable question bank table — filter by type/difficulty/tag/text; shows case count, submission count, last-updated |
| `/questions/new`, `/questions/[id]` | Question author/edit form (`QuestionForm`) — the UI here is *type-specific*: DSA needs a test-case table + starter code per language; MCQ needs an option builder with correct-answer marking; frontend/bug-fix/api/repo each need their own config editor. Plus `PreviewRunner`: the recruiter runs their own question exactly as a candidate would, against every test case including hidden ones |
| `/tests` | Test list |
| `/tests/[id]` | The core recruiter workspace — a 6-tab shell: **Overview** (settings form: duration, proctoring level, scheduling window, shuffle/partial-credit toggles, Markdown instructions editor), **Questions** (ordered picker for individual questions or question *pools* — a pool is a set of interchangeable questions where each candidate gets one random pick, frozen per-session), **Invitations** (bulk-invite via textarea or CSV upload, table of sent invitations with status + copyable link + revoke/extend), **Results** (sortable candidate table — status, score, integrity score, plagiarism %, time taken, tags — with checkbox multi-select for bulk shortlist/tag, and CSV/PDF export buttons), **Analytics** (score-distribution histogram, per-question pass-rate/avg-score/avg-time table), **Plagiarism** (deduped list of high-similarity pairs → click into a side-by-side diff view with matched ranges highlighted) |
| `/sessions/[id]` | Single-candidate deep review — this is the highest-stakes screen for information density: per-question score breakdown, the candidate's actual submitted code/answer, `IntegrityPanel` (integrity score + one-time "Environment" checks summary + continuous behavioral event timeline + webcam snapshot gallery), `ReplayView` (keystroke-level playback of how a solution was typed), and a manual reviewer rubric (sliders + a note) |
| `/activity` | Org-wide staff audit log (who did what, when — color-coded by action type) |
| `/settings` | Branding form: display name, tagline, logo URL, favicon URL, accent color, support email, privacy-policy URL, and the "hide all CodeForge branding" toggle |

### 4b. Candidate flow (single dynamic route `/t/[token]`, an internal state machine — desktop-only, ≥900px enforced)

1. **Identity verification** — confirm name/email against the invitation, plus a proctoring disclosure box that lists *exactly* what will be recorded at this test's proctoring level, before anything is captured
2. **Instructions** — rendered Markdown set by the recruiter
3. **Environment check** — a permission/hardware checklist (camera, mic, fullscreen support, browser checks) with a plain-language "why" next to every single row; some rows block continuing, some are informational-only
4. **Live test** — a persistent header (server-enforced countdown timer, question nav), and one of six distinct workspace UIs depending on question type (see §6)
5. **Confirmation** — post-submit screen

### 4c. Marketing site (`apps/marketing`, single long-scroll page)

Hero → "Why self-host" → Assessment-type showcase → Language marquee → Security model → Feature grid → How it works → FAQ → CTA → Footer, plus a floating AI chat widget (answers product questions, redirects off-topic).

---

## 5. Complete API surface

*Every endpoint the frontend can call. Field names below are the actual response/request shapes — use them as the ground truth for what data each screen can show, not placeholder content.*

### Auth — `/api/auth`
- `POST /login` `{email,password}` → `{accessToken, user:{id,name,email,role}}`, sets httpOnly refresh cookie
- `POST /refresh` → same shape, rotates the refresh token
- `POST /logout`
- `GET /me` → current staff user

### Users — `/api/users` *(super_admin only)*
- `GET /` → `{users:[{id,name,email,role,createdAt}]}`
- `POST /` `{name,email,password,role}`

### Organization / branding — `/api/org`
- `GET /public` **(no auth — pre-login)** → `{name, displayName?, tagline?, logoUrl?, faviconUrl?, accentColor?, accentColorHover?, supportEmail?, privacyUrl?, hideCodeForgeBranding}`
- `GET /` → `{org:{id,name,branding}}`
- `PUT /` → full branding-object update

### Questions — `/api/questions`
- `GET /?type=&difficulty=&tag=&q=&archived=` → `{questions:[{id,title,type,difficulty,tags,version,updatedAt,createdBy:{name},_count:{testCases,submissions,testQuestions}}]}`
- `POST /` `{type,title,bodyMd,difficulty,tags,estimatedMinutes?,isShared,typeConfig,testCases[],rubric?}`
- `GET /:id` → full detail incl. `testCases[]`
- `PUT /:id` → update; **auto-versions** if the question already has submissions (response includes `versioned: boolean` — historical results stay pinned to the old version)
- `POST /:id/duplicate`
- `DELETE /:id` (soft-archive)
- `POST /:id/preview-run` `{code,language}` → `{results:[{verdict,passed,stdout,stderr,timeMs,memoryKb,input,expectedOutput,isHidden,weight}]}`

### Tests — `/api/tests`
- `GET /` → list with `counts:{questions,invited,inProgress,completed}`
- `POST /` `{title,description,durationMinutes,proctoringLevel,schedulingStart?,schedulingEnd?,settings}`
- `GET /:id` → detail incl. `questions[]`
- `PUT /:id`
- `PUT /:id/questions` `{items:[{questionId?|poolId?, points}]}` (draft only)
- `GET/POST /:id/pools`, `DELETE /:id/pools/:poolId`
- `POST /:id/publish`, `POST /:id/close`, `DELETE /:id`
- `POST /:id/invitations` `{candidates:[{name,email}], expiresAt?}` → `{created:[{id,email,name,link}], skipped:[email]}`
- `GET /:id/invitations` → list with nested `session:{id,status,startedAt,submittedAt,endsAt}` + generated `link`

### Invitations — `/api/invitations`
- `POST /:id/revoke`
- `POST /:id/extend` `{expiresAt}`

### Results, analytics, export
- `GET /api/dashboard` → `{stats:{tests,published,invitations,completed,inProgress,questions}}`
- `GET /api/audit-log?limit=`
- `GET /api/tests/:testId/results` → `{test, summary:{invited,byInvitationStatus,started,completed,averageScore}, sessions:[{sessionId,candidateName,candidateEmail,status,startedAt,submittedAt,endsAt,totalScore,maxScore,gradingPending,timeTakenMinutes,integrityScore,plagiarismMaxPct,shortlisted,tags}]}`
- `GET /api/sessions/:sessionId` → session meta, `totals`, `breakdown[]` (per-question incl. `finalSubmission.judgeResults[]`, `draft`)
- `DELETE /api/tests/:testId/sessions/:sessionId`
- `GET /api/tests/:testId/analytics` → `{cohortSize, scoreDistribution:[{bucketStartPct,count}]×10, avgTimeToCompleteMinutes, perQuestion:[{questionId,title,type,attempts,cohortSize,avgScorePct,passRatePct,avgTimeSpentMinutes}]}`
- `GET /api/tests/:testId/results/export.csv` / `export.pdf`
- `POST /api/tests/:testId/sessions/bulk` `{sessionIds[], action:shortlist|unshortlist|addTag|removeTag, tag?}`
- `GET/PUT /api/sessions/:sessionId/review-notes` → `{rubric:DEFAULT_MANUAL_RUBRIC, notes:[{id,reviewerName,rubricScores,note,updatedAt}]}`
- `PATCH /api/submissions/:submissionId/score` `{manualScore:number|null}`

### Integrity, replay, plagiarism
- `GET /api/sessions/:sessionId/integrity` → `{integrity:{score,deductions:[{type,count,deducted}]}, timeline:[{type,severity,metadata,createdAt}], snapshots:[{url,at,facePresent,kind}]}`
- `GET /api/sessions/:sessionId/replay/:questionId` → `{batches:[{seq,ops,createdAt}]}`
- `POST /api/tests/:testId/plagiarism-scan`
- `GET /api/tests/:testId/plagiarism` → `{reports:[{reportId,kind,similarityPct,questionTitle,a:{sessionId,candidateName,candidateEmail},b:{...}|{referenceLabel},createdAt}]}`
- `GET /api/plagiarism/:reportId` → `{report:{id,kind,similarityPct,matchedRanges,questionTitle,a:{name,content,language},b:{...}}}`

### Candidate flow — `/api/candidate` *(token-authed, no login)*
- `GET /context` — pre-auth landing data: branding, test meta, proctoring config, invitation/session status
- `POST /verify-identity` `{name,email}` (locks the link after 5 mismatches)
- `POST /start` — begins the server-side timer
- `GET /state` — full in-test state: session, test, `questions[]` (type-specific config, incl. presigned reference images for frontend UI questions), `drafts`, submission summary
- `PUT /questions/:questionId/draft` `{content,language?}` — autosave
- `POST /questions/:questionId/run` `{code,language}` — sample cases only
- `POST /questions/:questionId/submit` — full graded submission, any question type
- `POST /questions/:questionId/validate-repo` `{url}` — dry-run clone check
- `POST /finish` — manual final submit
- `POST /events` `{events:[{type,metadata?}]}` → `{ok,forceSubmitted,warnings:[{type,count,limit}]}` — batched proctoring signals
- `POST /editor-events` `{questionId, ops:[{t,o,d,i,init?}]}` — keystroke deltas for replay
- `POST /snapshot` `{imageBase64,facePresent,kind}` — webcam capture (strict/lockdown only)

---

## 6. The six question types need six distinct workspace designs

This is the core of the product's differentiation from generic "leetcode-clone" hiring tools — each deserves real design attention, not a shared generic shell:

1. **DSA / coding** (`dsa`) — Monaco editor + language picker, Run (sample cases) vs. Submit (all cases) split, a results panel showing per-case verdict/stdout/stderr/time/memory.
2. **MCQ/MSQ** (`mcq`) — single- or multi-select options, optional per-question timer, optional negative marking. Needs to feel distinct from a coding question at a glance (no editor chrome at all).
3. **Frontend UI challenge** (`frontend_ui`) — split-pane: code editor(s) for HTML/CSS/JS on one side, a live sandboxed `<iframe>` preview on the other. On the *review* side (recruiter), this becomes a reference/candidate/diff **three-image comparison** (pixel-diff grading) — this comparison view needs real design thought, it's currently the most information-dense non-tabular view in the product.
4. **API/backend challenge** (`api_challenge`) — candidate writes a server; needs a way to show the scripted HTTP test sequence and pass/fail per assertion (status/body/JSON-path), not just a pass count.
5. **Bug-fix challenge** (`bug_fix`) — multi-file project with file tabs, a hidden test suite that needs to visibly go from failing → passing as the candidate works.
6. **Repo submission** (`repo_project`) — a GitHub URL field, a "Validate" dry-run button, and on the review side: git-history metadata (commit count, timing spread, generic-commit-message heuristic) plus optional screenshots of the running app.

---

## 7. Proctoring & integrity — tone matters as much as layout

This is the most sensitive part of the product to get right visually. The rule that governs it: **integrity signals are inputs for a human reviewer, never an automated verdict.** The design has to carry that, not just the copy:

- The pre-test environment check explains *why* each permission is needed, in plain language, before asking — never a bare native permission prompt with no context.
- Nothing in the candidate-facing UI should look like a lie-detector or a red-flag system. Reserve red for actual hard failures (e.g. camera denied when required); flagged-but-non-blocking signals need a visually distinct, calmer treatment (amber, not red) so a candidate glancing at their own screen doesn't panic over something informational.
- On the recruiter side, the Integrity panel needs a clear visual hierarchy: the score itself, a short explanatory disclaimer *always visible* (not hidden in a tooltip), then deduction badges, then a separated "Environment" one-time-check summary, then the full continuous event timeline, then webcam snapshots — in that order, most-summarized to most-detailed.
- The plagiarism diff view needs to make matched code ranges immediately scannable without feeling like an accusation screen — this is shown to a human who still has to make a judgment call.

---

## 8. Status & badge vocabulary (needs a consistent visual language across the whole app)

| Field | Values |
|---|---|
| `Role` | `super_admin`, `recruiter`, `reviewer` |
| `QuestionType` | `dsa`, `mcq`, `frontend_ui`, `bug_fix`, `api_challenge`, `repo_project` — **each should get its own icon**, used consistently in the question bank, test builder, and candidate nav |
| `Difficulty` | `easy` / `medium` / `hard` |
| `TestStatus` | `draft`, `published`, `closed`, `archived` |
| `InvitationStatus` | `pending`, `opened`, `started`, `completed`, `expired`, `revoked` |
| `SessionStatus` | `created`, `in_progress`, `submitted`, `auto_submitted`, `expired` |
| `SubmissionStatus` | `queued`, `running`, `graded`, `failed` |
| `ProctoringLevel` | `none`, `basic`, `strict`, `lockdown` |

Plus: `shortlisted` (boolean — star/flag treatment), `tags[]` (free-form chip list per candidate), `integrityScore` (0–100, needs a color gradient, not a hard threshold cutoff), `plagiarismMaxPct`, `gradingPending` (an async/pending state that shows up mid-grading on the results table), and the auto-score vs. manual-override distinction on a submission.

Semantic status color (pass/fail/pending/flagged) should be a separate palette from the brand accent — don't let a white-labeled client's accent color double as a "success" or "danger" signal.

---

## 9. Hard constraints (non-negotiable)

- **White-label first.** Every brand-identifying color has to route through a swappable token, not a hardcoded value — this needs to extend further than it currently does (see the recruiter-dashboard gap in §3).
- **Accessibility can't regress.** WCAG A/AA, 0 violations, is the current bar.
- **Performance for unknown/weak candidate hardware.** Minimal JS-driven animation, nothing animating during active typing in the code editor, everything respects `prefers-reduced-motion`.
- **Desktop-primary, not a mobile redesign.** The candidate flow already requires a desktop-sized viewport (coding on a phone isn't realistic); the recruiter dashboard is a daily-use desktop tool. Tablet-down degradation matters more than a true mobile layout.
- **Stack**: Next.js 15 (App Router) + Tailwind v4 + Monaco editor + a small amount of Framer Motion (reserved for cases CSS genuinely can't do well, like exit-animations on unmounting modals). Any redesign needs to be implementable in this stack, not assume a different one.
- **Don't change the API contract.** Every endpoint in §5 is load-bearing; a redesign changes presentation, not what data exists or how it's fetched.

---

## 10. What to deliver

1. A **design plan** up front: a named color system (semantic status colors kept separate from the swappable brand accent), a type pairing (UI face + a monospace face for code/data), and a spacing/radius/motion system — stated as explicit tokens, not just "use these hex codes in Figma."
2. High-fidelity mockups for the highest-leverage screens first: `/dashboard`, `/tests/[id]` (all 6 tabs), the candidate Environment Check + one full workspace type (pick DSA), and `/sessions/[id]` (the Integrity panel). These four cover almost every UI pattern in the product.
3. The **frontend UI question's three-way diff view** (§6.3) as its own focused exploration — it's the most unusual screen in the product and doesn't have an obvious off-the-shelf pattern to copy.
4. A component inventory: button variants, badge/status-chip system (mapped against §8's full enum list), table row patterns, empty states, the six question-type icons, and the modal/dialog pattern.
5. Both a light and a reasoned dark treatment for the recruiter dashboard (the candidate flow is already intentionally dark-mode-only, as a "focused exam" visual register distinct from the recruiter tool — a redesign can keep or challenge that split, but should make the call explicitly rather than by default).
