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

**Close the gaps `SECURITY.md` already tracks** (verified still open in the code as of this doc):
- Access token persisted to `localStorage` (`apps/web/src/lib/api.ts`, `apps/hq/src/lib/api.ts`) — `SECURITY.md`'s own plan is to move to in-memory-only storage plus a CSP `script-src` restriction. XSS-readable today; mitigated only by the 15-minute expiry and sanitized-Markdown-only user HTML.
- Judge0 runs unauthenticated inside `judge0_net` — `AUTHN_TOKEN` exists as a config option (`judge0.conf`) but isn't enabled by default. Turn it on and mirror the token into the API config before any deployment that publishes port 2358 beyond localhost.
- Candidate invitation tokens are stored raw, not hashed (`apps/api/src/routes/test.routes.ts`, `Invitation.token`) — `SECURITY.md` notes this needs the re-copy-link UX reworked first (a show-once link, or a regenerate-on-resend flow) before hashing at rest is possible without breaking recruiters' ability to re-share a link.

**New gaps this round's audit found, not yet tracked anywhere:**
- No 2FA (TOTP) on login, either app. The single biggest authentication gap — nothing in `SECURITY.md` or the zero-trust spec covers it, and grepping the codebase for `2fa`/`totp`/`mfa` turns up nothing.
- No session/device management. `RefreshToken` / `HqRefreshToken` already model one row per active session — there's just no endpoint or UI to list a user's active sessions or revoke one by device, only the existing "revoke all on role/permission change" logic.
- `apps/hq` has none of `apps/web`'s auth-hardening parity work — worth a pass once the two items above land on the product side, so both dashboards move together instead of drifting.

**Multi-tenant defense-in-depth already spec'd, not yet built** — `docs/zerotrust_sec_spec.pdf` ("Zero-Trust Compute Sandbox & Multi-Tenant Security Spec," v1.0, draft) has already designed these in detail; building from that doc rather than re-speccing:
- Per-tenant BullMQ/Judge0 submission quotas (§3.3) — today's rate limits are global/per-IP, not per-organization.
- Token binding for staff sessions (§5.1.1).
- Database-layer row-level security (§4.2) as a second isolation layer beneath the existing application-layer `organization_id` scoping.

## Business operations & client communication

- **In-app notification center** for both dashboards, building on the alert infrastructure already shipped in `apps/hq-api/src/lib/alerts.ts` (currently fires to email/Slack only, nothing in-app).
- **Automated renewal-reminder emails** off `Client.nextRenewalDate` — the field already exists on the model and is shown in the UI, but nothing reads it proactively; today a renewal only gets noticed if someone happens to look.
- **Public, read-only client status page**, sourced from the `HealthCheckLog` data HQ already collects every 5 minutes — currently that data only surfaces internally.
- **Roll bulk actions + CSV export out to the list pages that don't have them yet** (tests, questions, clients, leads). The Results tab already has both (row selection, bulk shortlist/tag/delete, CSV export) — same pattern, just not applied everywhere.
- **A lightweight support/helpdesk path** for client communication — even a tagged shared-inbox convention off the existing lead/contact email flow would be a real step up from ad hoc email today.
- **Command palette** (`Cmd+K`) for faster navigation across both dashboards, once there's enough surface area (list pages, settings, account) that jumping between them by mouse starts to feel slow — not urgent today, but worth having on the list before the app grows past the point where it's easy to retrofit.
