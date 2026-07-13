# CodeForge — Frontend Design Brief

> **How to use this document:** everything below the horizontal rule is written to be pasted
> directly into an AI design tool (Claude, Google Stitch, v0, etc.) as a single prompt to design
> or redesign CodeForge's frontend. It is self-contained — it does not assume the tool has access
> to this repository. It describes the product, every backend endpoint the frontend calls, every
> screen that needs to exist, and the branding/white-label system the visual design must support.
> Trim sections you don't need (e.g. paste only the "Screens" + "Design system" sections if you
> only want new visual designs and already trust the current data-fetching code).

---

## 1. What CodeForge is

CodeForge is a **self-hosted, white-labeled technical assessment platform** — the backend for a
company that wants to run its own coding/technical interviews under its own brand, without
paying a per-seat SaaS vendor. Think "HackerRank/Codility, but you own the deployment."

**Commercial model (important — shapes the design):** CodeForge is sold and deployed **one
instance per client**. Each client gets their own server, own database, own domain, and their own
branding (logo, colors, name) applied throughout. There is no multi-tenant signup flow, no
pricing/plan-tier UI, and no cross-company tenant switcher — from the moment someone loads the
app, they're looking at *their own company's* assessment tool. The design should treat "the
organization" as a singleton, not a thing the user picks from a list.

Two completely different audiences use this product, in two different UI contexts:

1. **Recruiters / hiring staff** (internal tool) — build question banks, assemble tests, invite
   candidates, watch progress, review results, override scores, check for cheating, export
   reports. This is a dense, data-heavy, keyboard-and-mouse desktop tool. Think Linear/Retool
   energy: efficient, information-dense, not flashy.
2. **Candidates** (external, high-stakes, one-shot) — click an emailed link, confirm identity, sit
   a timed exam with a code editor / MCQ / API tester / etc., and submit. This experience must be
   **calm, unambiguous, and low-anxiety**: a candidate who is confused by the UI is a candidate
   who does worse for reasons that have nothing to do with their actual skill. No dead ends, no
   surprise navigation, always-visible timer and save status.

Six question types exist today, all fully implemented: **DSA/coding** (Monaco editor, run against
sample cases, submit against hidden cases via Judge0 sandboxed execution), **MCQ/MSQ**
(single/multi-select), **Frontend UI** (candidate writes HTML/CSS/JS, graded by rendering
screenshots and diffing against a reference design), **Bug Fix** (candidate patches files in a
starter repo, graded against a hidden test suite), **API/Backend Challenge** (candidate's server
is spun up in a container and hit with test requests), and **Repo Project** (candidate submits a
git URL; clone/install/build/test runs in a sandboxed pipeline).

Everything about scoring, timers, and hidden test cases is **server-authoritative** — the client
is never trusted for anything that affects a candidate's score or the exam clock. Keep that
invariant in mind when designing any new UI: never invent a client-side countdown that isn't
reconciled against `serverNow`/`endsAt` from the API, and never show a "score" that wasn't
computed server-side.

---

## 2. Design principles

- **Two distinct visual registers, one shared brand system.** The recruiter dashboard is a
  professional B2B tool (dense tables, filters, tabs, modals). The candidate flow is a focused,
  single-column, distraction-free exam UI. Both must respect the client's branding (see §4), but
  the *density and information architecture* should differ intentionally.
- **Never hide state.** Autosave status, time remaining, submission status, and grading status
  ("queued" / "running" / "graded" / "failed") must always be visible where relevant — recruiters
  and candidates both make decisions based on this state.
- **No dead ends for candidates.** Every candidate screen needs an obvious next action. If
  something is wrong (expired link, revoked invitation, time up), say so in plain language and
  give a clear "what do I do now" (usually: contact the recruiter/support email).
- **Accessibility is not optional.** WCAG AA contrast minimums, keyboard focus states on every
  interactive element (including custom checkboxes/selects), and accessible names on icon-only
  buttons. This has already been enforced once via automated `axe-core` scans — don't regress it.
- **Real content, no lorem ipsum.** Use realistic recruiter/candidate copy in mockups (real
  question titles, real candidate names, real durations) so density and line-wrapping look right.
- **No emojis in the product UI.** Plain, professional iconography only.

---

## 3. Frontend stack (current implementation, if you're generating real code)

- **Next.js (App Router)**, TypeScript, Tailwind CSS.
- Recruiter pages live under a `(dash)` route group with a shared sidebar layout; candidate pages
  live under `/t/[token]`.
- Auth: JWT access token kept client-side, rotated via an httpOnly-cookie refresh flow. Every
  recruiter-side fetch sends `Authorization: Bearer <token>`.
- Candidate auth is tokenless: the invitation token is embedded in the URL (`/t/:token`) and
  every candidate API call is scoped to that token server-side — there is no candidate login form
  beyond a lightweight "confirm your name + email" identity check.
- Code editing uses Monaco; Markdown (question bodies, instructions) is rendered with
  `rehype-sanitize` to block stored XSS from recruiter-authored content.

If you are asked to produce visual designs only (not code), you can ignore this section.

---

## 4. Branding / white-label design system

Because CodeForge is resold per-client, **the visual identity must be fully data-driven**, not
hardcoded. There is one org-level branding config with these fields (all optional — every one
has a sane CodeForge-default fallback):

| Field | Purpose |
|---|---|
| `displayName` | Replaces "CodeForge" as the product name shown to users |
| `tagline` | Short subtitle, e.g. shown under the login form / in the browser tab title |
| `logoUrl` | Light-mode logo, replaces the wordmark |
| `logoDarkUrl` | Dark-mode variant |
| `faviconUrl` | Browser tab icon |
| `accentColor` / `accentColorHover` | Primary brand color + its hover state (6-digit hex) |
| `supportEmail` | Shown to candidates who hit trouble ("Contact {supportEmail}") |
| `privacyUrl` | Link to the client's own privacy policy, shown on candidate-facing pages |
| `hideCodeForgeBranding` | White-label switch: when true, suppress every "Powered by CodeForge" mention entirely |

**Fallback chain (apply this exact logic anywhere a brand mark appears):** custom `logoUrl` →
custom `displayName` as styled text → default "CodeForge" wordmark. If `hideCodeForgeBranding` is
true, never fall through to the default wordmark or any "Powered by" attribution line — the
client's own name/logo (or nothing) is all that shows.

**Design-system ask for a redesign:** implement theming via CSS custom properties (e.g.
`--accent`, `--accent-hover`) set once at the root from the branding API response, so
`accentColor` cascades to *every* primary button, link, focus ring, and active-state indicator
across both the recruiter dashboard and the candidate flow — not just the candidate-facing pages.
(The current shipped implementation only threads the accent color through the candidate flow and
leaves the recruiter dashboard on a fixed indigo palette as a scope trade-off; a proper redesign
should close that gap so a client's brand color is consistent everywhere, not just externally.)

Where to surface branding, concretely: recruiter sidebar header, login page, browser tab
title+favicon, candidate landing/identity page, in-test header, submission-confirmation page,
PDF export header, and invitation emails.

---

## 5. Backend API reference

Base path is `/api`. Two auth models:

- **Staff auth**: `Authorization: Bearer <accessToken>` header, obtained from `POST
  /auth/login`. Roles: `super_admin` (full access + user management), `recruiter` (author
  content, manage tests/candidates, override scores), `reviewer` (read-only everywhere except
  their own rubric notes). Every route below marked "staff read" accepts all three roles; "staff
  write" requires `super_admin` or `recruiter`.
- **Candidate auth**: no login. The invitation token from the emailed link
  (`{webOrigin}/t/{token}`) is sent with every request (as a header or path-embedded, depending on
  route) and server-validated against the `Invitation` row — expiring, revocable, locked after 5
  failed identity checks.

### 5.1 Auth

| Method & path | Auth | Body → Response |
|---|---|---|
| `POST /auth/login` | none | `{email, password}` → `{accessToken, user:{id,name,email,role}}`. Sets an httpOnly refresh cookie. |
| `POST /auth/refresh` | refresh cookie | none → new `{accessToken, user}`. Rotates the refresh token. |
| `POST /auth/logout` | refresh cookie | → `{ok:true}`. Revokes the refresh token. |
| `GET /auth/me` | staff | → `{user}` |

### 5.2 Organization / branding

| Method & path | Auth | Body → Response |
|---|---|---|
| `GET /org/public` | **none (public)** | → `{name, displayName, tagline, logoUrl, logoDarkUrl, faviconUrl, accentColor, accentColorHover, hideCodeForgeBranding}`. Powers the login page and root `<title>`/favicon before anyone is authenticated. Deliberately never returns `supportEmail`/`privacyUrl`. |
| `GET /org` | staff read | → `{org:{id,name,branding}}` — full branding object for the Settings form. |
| `PUT /org` | staff write | Body = full branding object (see §4 fields) → `{org}`. **Full-replace semantics**: omit a field to clear it, don't send `null` for "no change." |

### 5.3 Staff users

| Method & path | Auth | Body → Response |
|---|---|---|
| `GET /users` | `super_admin` only | → `{users:[{id,name,email,role,createdAt}]}` |
| `POST /users` | `super_admin` only | `{name,email,password,role}` → `201 {user}`. 409 if email taken (staff emails are globally unique across the whole platform, not just this org). |

### 5.4 Questions (question bank)

| Method & path | Auth | Body → Response |
|---|---|---|
| `GET /questions?type=&difficulty=&tag=&q=&archived=` | staff write role gate* | → `{questions:[...]}` with `_count` of test cases / submissions / test usages. Latest (non-superseded) versions only unless `archived=true`. |
| `POST /questions` | staff write | `{type, title, bodyMd, difficulty, tags[], estimatedMinutes?, isShared?, typeConfig, testCases[], rubric?}` → `201 {question}` |
| `GET /questions/:id` | staff write | → `{question}` incl. test cases |
| `PUT /questions/:id` | staff write | Same body shape. **Versioning rule**: if the question already has real candidate submissions, editing creates a new version row (old one gets `supersededById`) so historical results keep pointing at what candidates actually saw; draft (unpublished) tests auto-repoint to the new version, published tests don't. Response includes `versioned: true/false` — surface this to the recruiter ("this created a new version because N candidates have already answered it"). |
| `POST /questions/:id/duplicate` | staff write | → `201 {question}`, a "(copy)" clone |
| `DELETE /questions/:id` | staff write | Soft-delete (archive) → `{ok:true}` |
| `POST /questions/:id/preview-run` | staff write | `{code, language}` → `{results:[...]}`. "Preview mode": recruiter runs their own DSA question against ALL test cases including hidden ones, to sanity-check it before use. |

*Every question route requires `requireStaffWrite` (reviewers cannot access the question bank at all).

`typeConfig` shape depends on `type` — dsa (time/memory limits, allowed languages, reference
solutions), mcq (options + correct answer keys, never sent to candidates), frontend_ui (reference
HTML/CSS + screenshot widths), bug_fix (starter files + hidden test files), api_challenge (starter
server code + request/response test spec), repo_project (instructions + build/test commands).

### 5.5 Tests (assessments) and their sub-resources

All under `requireStaffWrite`.

| Method & path | Body → Response |
|---|---|
| `GET /tests` | → `{tests:[{...counts:{questions,invited,inProgress,completed}}]}` |
| `POST /tests` | `{title, description?, durationMinutes, proctoringLevel, schedulingStart?, schedulingEnd?, settings}` → `201 {test}` |
| `GET /tests/:id` | → `{test}` with ordered questions (incl. pool info) + invitation/session counts |
| `PUT /tests/:id` | Same body shape → `{test}`. 400 if the test is archived. |
| `PUT /tests/:id/questions` | `{items:[{questionId|poolId, points}]}` (draft-only) → replaces the ordered question list |
| `GET /tests/:id/pools` | → `{pools}` |
| `POST /tests/:id/pools` | `{name, questionIds[2..20]}` (draft-only) → `201 {pool}`. Question pools: each candidate is randomly assigned one interchangeable question from the pool, frozen for their session — reduces answer-sharing across staggered start times. |
| `DELETE /tests/:id/pools/:poolId` | → `{ok:true}` |
| `POST /tests/:id/publish` | → `{test}`. Requires ≥1 question, scheduling window not already past. |
| `POST /tests/:id/close` | → `{test}`. Only from `published`. |
| `DELETE /tests/:id` | Archives (not a hard delete) → `{ok:true}` |
| `POST /tests/:id/invitations` | `{candidates:[{name,email}] (max 500), expiresAt?}` (test must be published) → `{created:[{id,email,name,link}], skipped:[emails already invited]}`. Sends the invitation email per candidate. |
| `GET /tests/:id/invitations` | → `{invitations:[{...,link,session:{status,startedAt,submittedAt,endsAt}}]}` |

Test statuses: `draft → published → closed`, or `archived` from any state. Only draft tests can
have their question list edited; only published tests accept invitations.

### 5.6 Invitations (individual actions)

| Method & path | Auth | Body → Response |
|---|---|---|
| `POST /invitations/:id/revoke` | staff write | → `{invitation}`. Blocked if the candidate already completed the test. |
| `POST /invitations/:id/extend` | staff write | `{expiresAt}` → `{invitation}`. Un-expires/un-revokes if it had lapsed. |

Invitation statuses: `pending → opened → started → completed`, or `expired`/`revoked`.

### 5.7 Candidate flow (token-scoped, no staff auth)

| Method & path | Body → Response |
|---|---|
| `GET /candidate/context` | → everything the pre-start landing page needs: `serverNow`, `org` (full branding for theming this page), `test` (title/description/duration/instructions/proctoring level/scheduling window/status/questionCount), `proctoring` (limits + whether webcam/fullscreen are required), `invitation` (name/email/status/expiry), `session` (null if not yet created). |
| `POST /candidate/verify-identity` | `{name, email}` → `{ok:true}`. Email must match the invitation; 5 mismatches locks the link (`revoked`). Creates the `TestSession` row on first success. |
| `POST /candidate/start` | → `{session:{status,startedAt,endsAt}}`. Validates scheduling window + expiry, resolves the (possibly pool-randomized) question order, computes the server-authoritative `endsAt`, schedules the auto-submit job. |
| `GET /candidate/state` | → the full in-exam payload: `serverNow`, `session`, `test` (title/duration only — no answer keys), `questions[]` (candidate-safe view — hidden test cases and MCQ correct answers stripped; frontend_ui questions get presigned reference-screenshot URLs), `drafts` (per-question autosaved content), `submissions` (per-question submit count + last-submitted time). **Poll or refetch this to rehydrate after a refresh.** If the deadline has silently passed, this call finalizes the session server-side before responding. |
| `PUT /candidate/questions/:id/draft` | `{content, language?}` → `{savedAt}`. Debounced autosave; call this frequently (e.g. every few seconds of inactivity) — server state is the source of truth, not localStorage. |
| `POST /candidate/questions/:id/run` | `{code, language}` → `{results:[{input,expectedOutput,stdout,stderr,compileOutput,verdict,passed,timeMs,memoryKb}]}`. DSA only, against visible sample cases only. Rate-limited. |
| `POST /candidate/questions/:id/submit` | `{content|code, language?}` → `201 {submissionId, version}`. Queues grading against the hidden suite; poll `GET /candidate/state`'s `submissions` map or the result for status. |
| `POST /candidate/questions/:id/validate-repo` | `{url}` → dry-run clone/inspect result, for the repo_project "Validate" button before final submit. |
| `POST /candidate/finish` | → `{status, submittedAt}`. Manual "Submit test" — idempotent if already submitted/auto-submitted. |
| `POST /candidate/events` | `{events:[{type, metadata?}]}` (batched) → `{ok, forceSubmitted, warnings:[{type,count,limit}]}`. Proctoring telemetry (tab switches, fullscreen exits, devtools-suspected, etc.). If a configured threshold is exceeded the session is force-submitted server-side — surface `forceSubmitted` and `warnings` to the candidate UI immediately. |
| `POST /candidate/editor-events` | `{questionId, ops:[{t,o,d,i,init?}]}` → `{ok:true}`. Keystroke-level deltas for recruiter session replay. Send continuously in the background; candidates never see this data. |
| `POST /candidate/snapshot` | `{imageBase64, facePresent?, kind}` → `201 {ok:true}`. Webcam snapshot upload, only for `strict`/`lockdown` proctoring levels. |

Session statuses: `created → in_progress → submitted` (manual) or `auto_submitted` (deadline/
integrity trigger), or `expired`.

### 5.8 Results & recruiter review

All under `requireAuth`; most need `requireStaffRead` (reviewers included), a few need
`requireStaffWrite` (noted).

| Method & path | Body → Response |
|---|---|
| `GET /audit-log?limit=` | → `{entries:[{action,targetType,targetId,metadata,actorName,actorEmail,createdAt}]}`. Powers the Activity page — staff accountability trail. |
| `GET /dashboard` | → `{stats:{tests,published,invitations,completed,inProgress,questions}}`. Home-page summary cards. |
| `GET /tests/:testId/results` | → `{test, summary:{invited, byInvitationStatus, started, completed, averageScore}, sessions:[{sessionId,candidateName,candidateEmail,status,startedAt,submittedAt,endsAt,totalScore,maxScore,gradingPending,timeTakenMinutes,integrityScore,plagiarismMaxPct,shortlisted,tags}]}`. Main Results tab table. |
| `GET /sessions/:sessionId` | → single-candidate deep-dive: session meta, `totals`, and a per-question `breakdown` (title, type, difficulty, body, MCQ answer key, the final submission with judge results and any presigned diff-screenshot URLs, draft if never submitted, `totalVersions`). |
| `DELETE /tests/:testId/sessions/:sessionId` | **staff write.** → `{ok:true}`. Permanently deletes a candidate: their invitation (cascades to session/drafts/submissions/judge-results/proctoring events/review notes), plus best-effort cleanup of their S3 media (webcam snapshots, diff/candidate screenshots — never the shared reference screenshot). Writes an audit-log entry. This is destructive and unrecoverable — the UI must confirm before calling it. |
| `GET /tests/:testId/analytics` | → `{cohortSize, scoreDistribution:[{bucketStartPct,count}] (10 buckets), avgTimeToCompleteMinutes, perQuestion:[{questionId,title,type,attempts,cohortSize,avgScorePct,passRatePct,avgTimeSpentMinutes}]}`. Analytics tab charts. |
| `GET /tests/:testId/results/export.csv` | → CSV file download (name/email/status/score/integrity/shortlisted/tags/times). |
| `GET /tests/:testId/results/export.pdf` | → PDF file download, same data, formatted as a printable report. |
| `POST /tests/:testId/sessions/bulk` | staff write. `{sessionIds[], action: shortlist\|unshortlist\|addTag\|removeTag, tag?}` → `{updated}`. Bulk row-selection actions in the Results table. |
| `GET /sessions/:sessionId/review-notes` | → `{rubric: DEFAULT_MANUAL_RUBRIC, notes:[{id,reviewerName,rubricScores,note,updatedAt}]}` — every reviewer's independent notes on this candidate. |
| `PUT /sessions/:sessionId/review-notes` | `{rubricScores, note}` → upserts *the current reviewer's own* note (one per reviewer per session). |
| `PATCH /submissions/:submissionId/score` | staff write. `{manualScore: number\|null}` → `{submission:{autoScore,manualScore,effectiveScore}}`. Manual override always stored separately from the automated score, never overwrites it. |

### 5.9 Integrity / proctoring / plagiarism

All under `requireAuth`; write action needs `requireStaffWrite`, everything else `requireStaffRead`.

| Method & path | Body → Response |
|---|---|
| `GET /sessions/:sessionId/integrity` | → `{integrity:{score,deductions} (a signal, never an auto-verdict), persistedScore, timeline:[{type,severity,metadata,createdAt}], snapshots:[{url (presigned),at,facePresent,kind}]}`. Powers the Integrity tab / panel on a candidate's detail page. |
| `GET /sessions/:sessionId/replay/:questionId` | → `{batches:[{seq,ops,createdAt}]}`. Keystroke-level replay data for a "watch them type" scrubber UI. |
| `POST /tests/:testId/plagiarism-scan` | staff write. → `202 {ok:true, submissions}`. Kicks off an async DSA-code similarity scan job. |
| `GET /tests/:testId/plagiarism` | → `{reports:[{reportId,kind:"candidate"\|"reference",similarityPct,questionTitle,a:{...},b:{...}|{referenceLabel},createdAt}]}` — deduped pairwise similarity list, sorted highest-first. |
| `GET /plagiarism/:reportId` | → `{report:{...,matchedRanges, a:{name,content,language}, b:{name,content,language} (or a labeled reference solution)}}` — full side-by-side diff detail. |

---

## 6. Screen inventory

### Recruiter dashboard (behind login, shared sidebar layout)

1. **Login** (`/login`) — email + password, branded wordmark/tagline, error state for bad
   credentials, no self-serve signup/forgot-password (staff accounts are provisioned by a
   `super_admin`, not self-registered).
2. **Dashboard / home** (`/dashboard`) — summary stat cards from `GET /dashboard`; likely the
   default landing screen after login.
3. **Questions** (`/questions`) — filterable/searchable table (type, difficulty, tag, text
   search, archived toggle) from `GET /questions`; per-row usage counts; "New question" CTA.
4. **Question editor** (`/questions/new`, `/questions/[id]`) — type-specific form: shared fields
   (title, body markdown, difficulty, tags, estimated time, shared-across-tests toggle) plus a
   type-specific config editor (test cases for DSA, options+answer-key for MCQ, reference
   HTML/CSS for frontend_ui, starter+hidden files for bug_fix, etc.). Needs a live Markdown
   preview and, for DSA, a "preview run" button that hits `preview-run` and shows results
   including hidden cases. Show the "editing this creates a new version" warning when the
   question already has submissions.
5. **Tests list** (`/tests`) — table with status pill (draft/published/closed/archived) and
   question/invited/in-progress/completed counts; "New test" CTA.
6. **Test detail** (`/tests/[id]`) — tabbed workspace, tabs are:
   - **Overview** — title/description/duration/proctoring level/scheduling window edit form;
     publish/close/archive lifecycle actions (each gated by the state-machine rules in §5.5).
   - **Questions** — ordered question list builder (add fixed questions or pools, assign points,
     reorder), draft-only.
   - **Invitations** — bulk-invite form (paste/upload a candidate list), invitations table with
     status, resend/revoke/extend actions, copyable candidate links.
   - **Results** — the main results table (`GET .../results`): sortable/filterable by status,
     score, integrity score, shortlist; row actions for shortlist/tag/delete; bulk actions toolbar
     when rows are selected; CSV/PDF export buttons; click a row to open the candidate detail view
     (`GET /sessions/:id`) showing per-question breakdown, submitted code with syntax highlighting,
     judge verdicts, and the manual-score-override control + reviewer rubric notes panel.
   - **Analytics** — score-distribution histogram, per-question stats table (attempt rate, avg
     score %, pass rate, avg time), avg completion time, from `GET .../analytics`.
   - **Plagiarism** — "Run scan" button (`POST .../plagiarism-scan`), results table of similarity
     pairs, click through to a side-by-side diff view (`GET /plagiarism/:id`) with matched-range
     highlighting.
   - Somewhere reachable from a results row: the **Integrity** view (`GET
     /sessions/:id/integrity`) — event timeline, severity, a webcam-snapshot gallery, and (if
     needed) the keystroke **Replay** scrubber (`GET .../replay/:questionId`).
7. **Activity** (`/activity`) — the audit-log feed (`GET /audit-log`), one row per sensitive
   staff action (score override, invitation revoke, branding update, question/test archive,
   test publish/close, staff user creation, **candidate delete**), each with a plain-language
   description, actor, and timestamp.
8. **Settings** (`/settings`) — the branding form described in §4 (identity, colors, contact
   links, white-label toggle) with a live preview panel, plus (super_admin only) staff user
   management (`GET/POST /users`).

### Candidate flow (`/t/[token]`, no login, single continuous route)

All screens share one branded shell (see §4) and read from `GET /candidate/context` /
`GET /candidate/state`.

1. **Landing / identity confirmation** — test title, description, duration, instructions
   (rendered markdown), proctoring disclosure (what's monitored, at what level, and why — this is
   a legal/trust surface, be explicit), a name+email form (`POST /verify-identity`), and (if
   `supportEmail` is set) a "trouble with this link?" contact line. Handle every terminal state
   with a clear message: expired invitation, revoked/locked link, test not yet open, test closed.
2. **Environment check** (for strict/lockdown proctoring) — camera/fullscreen permission prompts
   before `POST /start` is allowed to succeed meaningfully.
3. **In-test runner** — persistent header (branded wordmark, live countdown reconciled against
   server time, autosave indicator, question navigator), and a **type-specific workspace** per
   question:
   - DSA/coding: Monaco editor, language picker, Run (sample cases) vs Submit (hidden suite),
     per-case pass/fail with stdout/stderr/compile output.
   - MCQ: option list (radio or checkbox depending on single/multi), no answer-key ever exposed.
   - Frontend UI: HTML/CSS/JS editors + a live preview iframe, and the reference-design
     screenshot(s) shown for comparison.
   - Bug Fix: multi-file editor over the starter files, "Submit" runs the hidden suite.
   - API/Backend Challenge: code editor for the candidate's server, likely an endpoint/spec
     reference panel.
   - Repo Project: a repo-URL input + "Validate" (dry-run clone) before final submit.
   Every workspace needs a submission-history indicator (version count, last submitted time,
   current grading status) and must never block on a slow "Run" — show pending/queued state.
4. **Submission confirmation** — after `POST /finish`, a clear "you're done" screen, no further
   navigation back into the exam.
5. **Locked-out / terminal-error states** — identity mismatch lockout, time-expired auto-submit
   notice, force-submit-due-to-integrity-violation notice (all reachable via the `forceSubmitted`/
   error paths above) — each needs distinct, honest copy (don't say "error" when the real message
   is "you ran out of time").

---

## 7. Non-negotiable constraints for any redesign

- Never render a client-computed score, verdict, or countdown as authoritative — always defer to
  the server response (`serverNow`, `endsAt`, `autoScore`, judge `verdict`).
- Never expose MCQ correct-answer keys or hidden test-case expected output in any candidate-facing
  view, even in dev tools / network tab — the API itself never sends them to `/candidate/*`
  routes, so as long as the frontend only renders what those endpoints return, this is safe by
  construction.
- Recruiter-authored Markdown (question bodies, instructions) must render through a sanitizing
  Markdown pipeline, never raw `dangerouslySetInnerHTML` of unsanitized content.
- Destructive actions (archive test/question, revoke invitation, **delete candidate**, force
  score override) need an explicit confirm step in the UI — these either cascade or are
  irreversible.
- `hideCodeForgeBranding` must be checked before rendering *any* "Powered by CodeForge" or default
  wordmark fallback, on both recruiter and candidate surfaces.
- Reviewer-role users must never see write affordances (edit/delete/override buttons) that the
  API would reject anyway — match the UI's capability gating to §5's staff-read vs staff-write
  split so reviewers aren't shown controls that 403.

---

## 8. What to deliver

Design (or redesign) high-fidelity screens for the inventory in §6, using the branding system in
§4 as live design tokens (not hardcoded colors), informed by the exact data shapes in §5 so every
screen you design is populated with fields that actually exist in the API. Favor clarity and
information density appropriate to each audience over decoration. If producing code, match the
stack in §3; if producing static mockups/Figma-style output, call out anywhere you've taken
creative liberty on copy or layout that isn't dictated by the data above.
