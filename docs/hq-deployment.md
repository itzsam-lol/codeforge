# Deploying CodeForge HQ

CodeForge HQ (`apps/hq-api` + `apps/hq`) is CodeForge's own internal ops
console — staff accounts, the client/lead CRM, and deployment provisioning
for client instances of the main product. It's a separate app with its own
auth and database; nothing here is customer-facing, so the bar for exposure
is different from `DEPLOYMENT.md`'s guide for the client product.

## Local development

1. Create the second database once (same Postgres instance as the product's):
   ```
   docker compose exec postgres psql -U codeforge -c "CREATE DATABASE codeforge_hq"
   ```
2. Add the `HQ_*` variables from `.env.example` to your `.env` (real secrets,
   not the placeholders — generate them the same way the file's comments
   describe).
3. Run migrations and seed the first owner account:
   ```
   npm run hq:db:deploy
   npm run hq:db:seed
   ```
4. Start both halves:
   ```
   npm run dev:hq-api
   npm run dev:hq
   ```
5. Visit `http://localhost:3100/login` with `HQ_SEED_OWNER_EMAIL` /
   `HQ_SEED_OWNER_PASSWORD`.

## Production

HQ ships as a `docker compose --profile hq` addition to the same stack
`DEPLOYMENT.md` walks through, reusing that Postgres instance under the
second database above (run the `CREATE DATABASE` step once on the server
too, before first boot).

```
docker compose --profile hq up -d --build
docker compose --profile hq exec hq-api npm run db:deploy
docker compose --profile hq exec hq-api npm run db:seed
```

Both `hq-api` and `hq-web` bind to `127.0.0.1` only (same loopback-only
pattern as Postgres/Redis/MinIO's console) — HQ is not meant to be
internet-facing by default, since it holds SSH credentials to every
client's server. Reach it from your own machine with an SSH tunnel:

```
ssh -L 3100:localhost:3100 -i codeforge.pem ubuntu@YOUR_SERVER_IP
```

then browse to `http://localhost:3100`.

If you'd rather have a real domain (e.g. `hq.yourdomain.com`) in front of
it, add a block to `Caddyfile` following the same shape as the existing
`APP_DOMAIN`/`MEDIA_DOMAIN` entries, pointed at `hq-web:3100`, and put it
behind your own access control (VPN, IP allowlist, or an auth proxy) —
Caddy's automatic HTTPS alone does not restrict who can reach it.

## Provisioning a client from HQ

The Provisioning tab on a client's page automates the steps
`DEPLOYMENT.md` Parts D–F document by hand: clone/pull the repo, template
`.env` with fresh generated secrets, bring the stack up, wait for TLS
certificates, run migrations, and seed the admin account. It assumes:

- The target VPS already exists, with DNS for both the app and media
  domains already pointed at it (Parts B–C).
- Docker (with the compose plugin) is already installed on it (Part D
  step 2) — HQ does not install Docker for you.
- The SSH user has passwordless `sudo`.

The SSH private key you paste in is encrypted at rest and never sent back
to the browser after saving; editing any other field on a target requires
re-pasting it, by design.

## Day-2 operations: health monitoring and alerts

Once a target is configured, `healthMonitor.ts` polls its `appDomain`'s
`/healthz` every 5 minutes and shows the result as a status pill on the
Clients list and client detail page. A healthy↔unhealthy transition also
writes an entry to that client's activity timeline and, if configured,
sends an alert:

```
HQ_EMAIL_DRIVER=resend        # or leave "console" to just log
HQ_RESEND_API_KEY=...
HQ_ALERT_EMAIL=oncall@yourteam.example
HQ_ALERT_SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
```

Both channels are optional and independent — set one, both, or neither
(neither just logs to the console, same as every other optional
integration in this repo). There's no per-staff-member notification
preference; it's one address and/or one webhook for the whole team.

The Provisioning tab also has three read-only, allowlisted SSH
diagnostics (disk space, container status, recent API logs) for checking
what's actually wrong without a manual SSH session.
