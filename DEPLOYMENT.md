# Deploying CodeForge

This is a step-by-step walkthrough for putting both pieces of the product online:

- **The platform** (recruiter dashboard + candidate test-taking flow + API + database):
  one Linux VPS running the existing `docker-compose.yml` stack, behind a domain you own.
- **The marketing site** (`apps/marketing`): deployed to Vercel, on the root domain.

It assumes no prior server-admin experience and tells you exactly what to click/type. Anywhere
you see `yourdomain.com`, replace it with the domain you actually buy.

## Architecture at a glance

```
yourdomain.com              -> Vercel                 -> apps/marketing (the sales site)
app.yourdomain.com          -> your VPS -> Caddy        -> web container  -> api container (internal)
media.yourdomain.com        -> your VPS -> Caddy        -> MinIO container (webcam/screenshot files)
```

Everything platform-side (Postgres, Redis, MinIO, Judge0, the API, the web app, and now Caddy)
runs as one `docker-compose` stack on a single server, matching the "one self-hosted deployment
per client" model this repo is already built around. The marketing site has no database of its
own, so it doesn't need the VPS at all.

## What you need before starting (checklist)

- [ ] A credit/debit card, for the domain registrar (an AWS account also needs one on file,
      even if you're spending credits rather than cash).
- [ ] A GitHub account, with this repo pushed to it (it already is: `itzsam-lol/codeforge`).
- [ ] An AWS account with credits available (this guide uses EC2; see cost notes in Part B for
      how far $81 goes).
- [ ] 60-90 minutes of focused time for the first setup.

---

## Part A: Buy a domain

If you already own one, skip to Part B.

1. Go to **[Cloudflare Registrar](https://www.cloudflare.com/products/registrar/)** (recommended:
   at-cost pricing, no markup, free WHOIS privacy, and the best free DNS panel, which you'll use
   in Part C). Namecheap is a fine alternative if you'd rather not create a Cloudflare account.
2. Search for the name you want, add it to cart, and complete checkout.
3. Once purchased, you'll manage DNS records for it from that same dashboard (Cloudflare:
   **DNS > Records** for the zone; Namecheap: **Domain List > Manage > Advanced DNS**).

You don't need anything else here yet, just the domain and access to its DNS settings.

---

## Part B: Create the server (AWS EC2)

This stack is plain Docker Compose, so EC2 works exactly as well as a VPS, it's just a few more
clicks because AWS splits "networking" and "the box" into separate concepts (security groups,
key pairs, Elastic IPs) that a VPS provider usually bundles into one screen.

### Sizing, and how far $81 in credits goes

This stack runs nine containers at once (Postgres x2, Redis x2, MinIO, Judge0 x2, api, worker,
web, Caddy), and Judge0 needs real CPU headroom to compile/run candidate submissions, so don't go
below 8 GB RAM. The AWS Free Tier's `t2.micro`/`t3.micro` (1 GB RAM) will not work here.

| Instance | vCPU / RAM | On-demand (us-east-1) | ~Hours from $81 | ~Days of 24/7 uptime |
|---|---|---|---|---|
| **`t3.large` (recommended)** | 2 / 8 GB | ~$0.0832/hr (~$60/mo) | ~970 hrs | ~40 days |
| `t3.xlarge` | 4 / 16 GB | ~$0.1664/hr (~$120/mo) | ~485 hrs | ~20 days |

Start with `t3.large`; it's burstable (CPU credits) rather than dedicated-core, which is fine for
low/moderate candidate volume, and it stretches your credit balance further while you're getting
this stood up. Upgrade later (Part I covers resizing) if grading feels sluggish under real load.
Also budget a small amount for the 40 GB root disk (~$3.20/mo) and AWS's public-IPv4 charge
(~$3.60/mo, applies to every public IP since Feb 2024, Elastic IP or not). Check **Billing >
Credits** in the AWS console for your credit's expiry date before you get too attached to the
timeline above.

### Launch the instance

1. Sign in to the **[AWS Console](https://console.aws.amazon.com)** and switch to your preferred
   region (top-right region picker, e.g. `us-east-1`). Note the region, you'll need to stay in it
   for every step below.
2. Go to **EC2 > Instances > Launch instance**.
3. **Name**: `codeforge`.
4. **Application and OS Images**: search for and select **Ubuntu Server 22.04 LTS** (the default
   "Quick Start" tile).
5. **Instance type**: `t3.large`.
6. **Key pair**: click **Create new key pair**, name it `codeforge`, type **RSA**, format
   **`.pem`** (or `.ppk` if you're on PuTTY). It downloads automatically, save it somewhere
   permanent, you cannot re-download it later if you lose it.
7. **Network settings > Edit**:
   - Auto-assign public IP: **Enable**.
   - Create a new security group named `codeforge-sg` with these inbound rules:

     | Type | Port | Source |
     |---|---|---|
     | SSH | 22 | My IP (safer than Anywhere, but Anywhere/0.0.0.0/0 works if your IP changes often) |
     | HTTP | 80 | Anywhere (0.0.0.0/0) |
     | HTTPS | 443 | Anywhere (0.0.0.0/0) |
8. **Configure storage**: change the root volume from the 8 GB default to **40 GB**, type
   **gp3**.
9. Click **Launch instance**.

### Give it a stable IP address

By default an EC2 instance's public IP changes if you ever stop/start it, which would silently
break your DNS records. Fix this once, up front:

1. **EC2 > Network & Security > Elastic IPs > Allocate Elastic IP address > Allocate**.
2. Select the new address, **Actions > Associate Elastic IP address**, pick your `codeforge`
   instance, **Associate**.
3. That Elastic IP (not the instance's original public IP) is what you'll point DNS at in Part C,
   and it stays the same for the life of the instance.

(If you'd rather use a plain VPS instead, Hetzner Cloud or DigitalOcean work identically, just
create an Ubuntu 22.04 server there with an SSH key instead of steps 6-9 above, everything from
Part C onward is provider-agnostic.)

---

## Part C: Point DNS at the server

In your domain's DNS panel (Cloudflare or Namecheap from Part A), add two records, using the
**Elastic IP** from Part B:

| Type | Name    | Value (target)      | Notes |
|------|---------|----------------------|-------|
| A    | `app`   | *your Elastic IP*    | recruiter dashboard + candidate links |
| A    | `media` | *your Elastic IP*    | webcam/screenshot file storage |

If you're on Cloudflare, set both records' proxy status to **DNS only** (grey cloud, not orange)
for now, since Caddy needs to complete its own Let's Encrypt certificate challenge directly
against your server in Part F; you can switch to proxied afterward if you want Cloudflare's
CDN/DDoS protection in front of it.

DNS changes can take a few minutes up to an hour to propagate. You can move on to Part D while
you wait.

---

## Part D: Prepare the server

1. On your own machine, lock down the key file's permissions (SSH refuses to use it otherwise)
   and connect. Ubuntu AMIs log you in as `ubuntu`, not `root`:
   ```
   chmod 400 codeforge.pem
   ssh -i codeforge.pem ubuntu@YOUR_ELASTIC_IP
   ```
2. Install Docker:
   ```
   curl -fsSL https://get.docker.com | sudo sh
   sudo usermod -aG docker ubuntu
   ```
   Log out (`exit`) and reconnect (step 1 again) so the group change takes effect; after that you
   won't need `sudo` for `docker`/`docker compose` commands.
3. Install Git:
   ```
   sudo apt-get update && sudo apt-get install -y git
   ```
4. Clone the repo:
   ```
   sudo mkdir -p /opt/codeforge && sudo chown ubuntu:ubuntu /opt/codeforge
   git clone https://github.com/itzsam-lol/codeforge.git /opt/codeforge
   cd /opt/codeforge
   ```
   (If the GitHub repo is private, you'll need a [personal access token](https://github.com/settings/tokens)
   or a deploy key here instead of a plain HTTPS clone; GitHub's own docs cover both.)

You do not need to configure `ufw` here: the EC2 security group from Part B (SSH/80/443 only)
already does the same job at the network level, one firewall is enough.

---

## Part E: Configure `.env` for production

1. Copy the template:
   ```
   cp .env.example .env
   ```
2. Generate two strong secrets and note them down:
   ```
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```
   (If `node` isn't installed on the server yet, `sudo apt-get install -y nodejs` first, or just
   run those two lines on your own machine instead, they don't need to run on the server.)
3. Edit `.env` (`nano .env`) and set:
   ```
   NODE_ENV=production
   WEB_ORIGIN=https://app.yourdomain.com
   API_ORIGIN=http://api:4000

   POSTGRES_PASSWORD=<pick a new strong value, not "codeforge">
   DATABASE_URL=postgresql://codeforge:<same value as POSTGRES_PASSWORD>@postgres:5432/codeforge
   REDIS_URL=redis://redis:6379

   JWT_ACCESS_SECRET=<first generated value>
   JWT_REFRESH_SECRET=<second generated value>

   EXECUTOR=judge0
   JUDGE0_URL=http://judge0-server:2358

   S3_ENDPOINT=https://media.yourdomain.com
   S3_ACCESS_KEY=codeforge
   S3_SECRET_KEY=<pick a new strong value, not the "codeforge-secret" default>
   S3_BUCKET=codeforge

   SEED_ORG_NAME=<your business/client's name>
   SEED_ADMIN_EMAIL=<your real email>
   SEED_ADMIN_PASSWORD=<a strong password, change it after first login>

   APP_DOMAIN=app.yourdomain.com
   MEDIA_DOMAIN=media.yourdomain.com
   ```
   Leave `EMAIL_DRIVER=console` for now, you'll switch it to `resend` in Part G once that
   account exists. Everything else in the template can stay at its default.

   Two things worth understanding here, since they trip people up:
   - `S3_ENDPOINT` must be the **public** `media.yourdomain.com` URL, not an internal address:
     the API hands out short-lived download links for webcam snapshots and screenshots directly
     to whichever browser is viewing them, and that browser can't resolve docker-internal names.
   - `POSTGRES_PASSWORD` and the password embedded in `DATABASE_URL`/`HQ_DATABASE_URL` must be
     the same value — `docker-compose.yml` feeds `POSTGRES_PASSWORD` to the postgres container
     itself, so a mismatch means the api/worker/hq-api containers can't authenticate against
     their own database. `S3_SECRET_KEY`/`S3_ACCESS_KEY` don't have this problem: MinIO reads
     those same two variables directly now, so there's nothing separate to keep in sync.
   - `docker compose` refuses to start any of these services at all if `POSTGRES_PASSWORD`,
     `S3_ACCESS_KEY`, or `S3_SECRET_KEY` are unset — a deploy can't silently run on the
     defaults that used to be hardcoded in `docker-compose.yml`.

---

## Part F: First boot

1. Still in `/opt/codeforge`, build and start everything:
   ```
   docker compose --profile app --profile prod up -d --build
   ```
   This pulls/builds every image and starts Postgres, Redis, MinIO, Judge0, the API, the worker,
   the web app, and Caddy. The first build takes a few minutes.
2. Watch Caddy pick up certificates (it does this automatically the first time each domain is
   reachable):
   ```
   docker compose logs -f caddy
   ```
   Look for lines mentioning `certificate obtained successfully` for both domains, then Ctrl+C
   out of the log follow.
3. Run database migrations and seed the first admin account:
   ```
   docker compose --profile app exec api npm run db:deploy
   docker compose --profile app exec api npm run db:seed
   ```
4. Visit `https://app.yourdomain.com/login` in a browser and sign in with the
   `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` you set in Part E.
5. Go to **Settings** and set your real branding (logo, colors, name), and turn on **"Hide all
   CodeForge branding"** if this is a white-labeled client deployment, per the checklist already
   in `README.md`'s "Selling CodeForge to a client" section.
6. Replace the demo seed questions with your real question bank before inviting real candidates,
   same README section covers this.

### If Judge0 fails with an isolate/cgroup error

Some newer kernels default to cgroup v2 only, which Judge0's sandbox doesn't support yet. Fix:
```
sudo nano /etc/default/grub
# add systemd.unified_cgroup_hierarchy=0 to GRUB_CMDLINE_LINUX
sudo update-grub
sudo reboot
```
The Elastic IP stays the same across the reboot, so reconnect with the same command as Part D
step 1 once it's back (give it 30-60 seconds), `cd /opt/codeforge`, and re-run the
`docker compose ... up -d --build` command from step 1; it's safe to run again.

---

## Part G: Set up transactional email (Resend)

Without this, invitation/reminder/results-ready emails only get logged to the container console,
not actually delivered, candidates would never receive their test links.

1. Create a free account at **https://resend.com** (100 emails/day, 3,000/month free, plenty for
   most hiring volumes).
2. **Domains > Add Domain**, enter `yourdomain.com`, and add the SPF/DKIM DNS records it shows you
   into the same DNS panel from Part C. Verification usually completes within a few minutes.
3. **API Keys > Create API Key**, copy the value.
4. Back on the VPS, edit `.env`:
   ```
   EMAIL_DRIVER=resend
   EMAIL_FROM=CodeForge <noreply@yourdomain.com>
   RESEND_API_KEY=<the key from step 3>
   ```
5. Restart the api/worker containers to pick up the change:
   ```
   docker compose --profile app --profile prod up -d --build api worker
   ```
6. Send yourself a test invitation from the platform and confirm the email actually arrives.

---

## Part H: Deploy the marketing site to Vercel

1. Go to **https://vercel.com**, sign up/log in with GitHub, and authorize it to access the
   `itzsam-lol/codeforge` repository (or your fork, if you renamed it).
2. **Add New... > Project**, select this repo.
3. On the configuration screen:
   - **Root Directory**: click Edit, choose `apps/marketing`.
   - Framework preset should auto-detect as **Next.js**; leave build/output settings default.
4. Before the first deploy (or right after, then redeploy), go to **Settings > Environment
   Variables** and add:
   - `GROQ_API_KEY` — the site's chat assistant proxies through a server route
     (`src/app/api/chat/route.ts`) so this key never reaches the browser; get one at
     **https://console.groq.com/keys**. If you shared a key anywhere in plaintext (chat, a
     screenshot, etc.), rotate it there first, treat it as compromised.
   - `NEXT_PUBLIC_SPLINE_SCENE_URL` — your Spline scene's runtime export URL (Spline editor:
     **Export > Code export**), looks like `https://prod.spline.design/<id>/scene.splinecode`.
     This one is intentionally public (`NEXT_PUBLIC_*`), it's just a 3D asset URL, not a secret.
5. Click **Deploy**. First deploy takes a minute or two; you'll get a `*.vercel.app` preview URL.
6. Once it's live, go to the project's **Settings > Domains**, add `yourdomain.com` (and
   optionally `www.yourdomain.com`), and follow Vercel's on-screen instructions, it'll tell you
   the exact DNS record to add (usually an `A` record to `76.76.21.21` or a `CNAME` for `www`) in
   the same DNS panel from Part C.
7. Wait for the domain to show **Valid Configuration** in Vercel (again, DNS propagation can take
   a few minutes to an hour).

From here on, every push to `main` on GitHub auto-deploys the marketing site, no manual redeploy
step needed.

---

## Part I: Ongoing operations

**Deploying a platform update** (after pulling new commits):
```
cd /opt/codeforge
git pull
docker compose --profile app --profile prod up -d --build
docker compose --profile app exec api npm run db:deploy   # only if there are new migrations
```

**Viewing logs:**
```
docker compose logs -f api
docker compose logs -f web
docker compose logs -f worker
```

**Backing up the database** (do this on a schedule, e.g. a daily cron job):
```
mkdir -p ~/backups
docker compose exec postgres pg_dump -U codeforge codeforge | gzip > ~/backups/codeforge-$(date +%F).sql.gz
```
Copy these off the instance periodically too (e.g. `scp` them to your own machine, or sync to S3),
a backup that only lives on the same disk as the database doesn't protect you from losing the
instance itself.

**Backing up uploaded media** (webcam snapshots, screenshots): back up the `minio_data` Docker
volume the same way, or point MinIO's own replication at an external bucket if you want
off-server redundancy.

**After a server reboot**: every service already has `restart: unless-stopped`, so Docker brings
the whole stack back up on its own once the VPS finishes booting; you shouldn't need to do
anything. If you ever do want to bring it back manually:
```
docker compose --profile app --profile prod up -d
```
