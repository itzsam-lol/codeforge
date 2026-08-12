# Roadmap: account security & business operations

Two work areas that come after the current round of dashboard fixes (performance,
missing bare-minimum account features, visual cleanup). This is planning, not a
build — nothing here is implemented yet.

A naming note: `SECURITY.md` already has its own "Phase 5" (hardening work that's
already shipped) and a "Known gaps (tracked beyond Phase 5)" section. To avoid a
second, colliding "Phase 5," the two sections below are deliberately unnumbered and
lean on `SECURITY.md` and `docs/zerotrust_sec_spec.pdf` as the source of truth
rather than re-describing what they already cover.

## Account security & trust

**Closed from `SECURITY.md`'s tracked gaps:**
- ~~Access token in `localStorage`~~ — done: `apps/web/src/lib/api.ts` and `apps/hq/src/lib/api.ts` now hold the token only in a module-private variable, never persisted, never on `window`. Cold loads re-mint one from the httpOnly refresh cookie via the existing 401-retry path.
- ~~Judge0 unauthenticated~~ — done: `AUTHN_TOKEN` is on in `judge0.conf`, mirrored to `JUDGE0_AUTH_TOKEN` in both apps' env, verified enforced (401 without it, 200 with it).
- Candidate invitation tokens still stored raw, not hashed — still open, still blocked on the re-copy-link UX rework noted below.

**Closed from this round's own audit:**
- ~~No 2FA~~ — done: TOTP enrollment/login-challenge/backup-codes shipped on both `apps/api` and `apps/hq-api`, with matching UI in both apps' `/account` pages and a second login step when enabled. Verified end-to-end (enroll → confirm → TOTP login → backup-code login → single-use enforcement → disable) on both backends.
- ~~No session/device management~~ — done: `GET/DELETE /api/auth/sessions[/:id]` on both backends, `RefreshToken`/`HqRefreshToken` gained `userAgent`/`ipAddress`/`lastUsedAt`, both apps' `/account` pages list active sessions with a device label and per-session/"sign out others" revoke.
- `apps/hq` auth-hardening parity — done as a side effect of building the two items above for both apps together rather than product-first.

**Still open:**
- Candidate invitation tokens stored raw (see above).

**Multi-tenant defense-in-depth already spec'd, not yet built** — `docs/zerotrust_sec_spec.pdf` ("Zero-Trust Compute Sandbox & Multi-Tenant Security Spec," v1.0, draft) has already designed these in detail; building from that doc rather than re-speccing:
- Per-tenant BullMQ/Judge0 submission quotas (§3.3) — today's rate limits are global/per-IP, not per-organization.
- Token binding for staff sessions (§5.1.1).
- Database-layer row-level security (§4.2) as a second isolation layer beneath the existing application-layer `organization_id` scoping.

## Business operations & client communication

All items below are done.

- ~~**In-app notification center**~~ — done: `Notification`/`HqNotification` models, org-wide (product) / global (HQ) feed, fed by the moments that already fire email/Slack alerts (new support ticket, a reply arriving, deployment up/down, a renewal reminder). Bell icon + unread badge + dropdown in both dashboards' sidebars, verified live (badge count, list, mark-read, mark-all-read).
- ~~**Automated renewal-reminder emails**~~ — done: `apps/hq-api/src/services/renewalReminder.ts`, a daily job alerting HQ staff (email/Slack + in-app) when a client's `nextRenewalDate` is within 14 days, deduplicated per renewal cycle via `Client.renewalReminderSentAt`. Verified firing and correctly deduplicating on repeat runs.
- ~~**Public, read-only client status page**~~ — done: `GET /api/status/:clientId` (unauthenticated by design) plus `apps/hq/src/app/status/[clientId]/page.tsx`, a public server-rendered page showing current status, 30-day uptime %, and a 90-day day-by-day history from `HealthCheckLog`. Linked from the client detail page. Verified live with real health-check data.
- ~~**Bulk actions + CSV export**~~ — done on tests, questions (`apps/web`) and clients, leads (`apps/hq`), mirroring the Results tab's existing pattern (selection checkboxes, a selection toolbar, partial-success bulk endpoints reusing each entity's existing single-item guards, CSV export with formula-injection-safe cells). Verified live (CSV export content, bulk publish/archive with correct skip counts).
- ~~**A lightweight support/helpdesk path**~~ — done: two-sided ticket system (`apps/api`/`apps/web` `SupportTicket`, `apps/hq-api`/`apps/hq` mirrored copy), routing to either the hiring org or CodeForge, surfaced in the candidate flow (including mid-exam and the post-submit confirmation), both dashboards' `/support` pages, and dual-write sync between the two backends.
- ~~**Command palette** (`Cmd+K`)~~ — done: a shared `CommandPalette` component in both dashboards (click trigger or Cmd+K, Ctrl+K collides with Chrome's own binding on Windows so the click trigger is the reliable path there), substring filter over every nav destination, arrow-key navigation, Enter to jump. Verified live.
