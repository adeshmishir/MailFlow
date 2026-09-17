# MailFlow

MailFlow is a production-grade email scheduling and delivery system. Users connect Google (OAuth) for sign-in, register sending identities, upload recipient lists, schedule timed campaigns, and get rate-limit alerts delivered to their Slack workspace. All emails are sent through a BullMQ worker via SMTP, indexed in Elasticsearch, and stored in PostgreSQL as the source of truth. Delivery is configurable: production SMTP (Gmail, Outlook, SendGrid, or any provider — see [Email Delivery](#email-delivery-smtp)) or Ethereal test SMTP by default.

> **Status:** Phase 6 Complete — Slack OAuth + DM alerts, rate-limit deduplication, secure BullMQ dashboard, and final hardening.

## Tech Stack

- **Frontend:** React, Vite, TypeScript, Tailwind CSS
- **Backend:** Node.js, Express, TypeScript
- **Database:** PostgreSQL via Prisma ORM
- **Queue:** BullMQ + Redis (distributed rate limiting and min-delay gating)
- **Search:** Elasticsearch (`@elastic/elasticsearch`)
- **Notifications:** Slack Web API (`chat:write`) with Redis-backed deduplication
- **Authentication:** Google OAuth 2.0 (Passport) + Redis-backed sessions
- **Infrastructure:** Docker Compose

## Architecture

```text
React Frontend
       |
       | REST API
       v
Express API Server
       |
       +-------------------+-------------------+
       |                   |                   |
       v                   v                   v
 PostgreSQL              Redis            Elasticsearch
 Source of Truth        BullMQ             Search Index
                           |
                           v
Worker (BullMQ)
                            |
                            +-------------------+
                            |                   |
                            v                   v
                    SMTP (Ethereal        Slack API
                    test by default)
```

The API server and the worker run as separate processes. PostgreSQL is the authoritative source of truth; Elasticsearch only powers search.

## Prerequisites

- Node.js 20+ and npm
- Docker + Docker Compose
- A Google OAuth app (Client ID + Secret)
- A Slack app (Client ID, Client Secret, Redirect URI) — optional for sending alerts

## Infrastructure (Docker)

```bash
docker compose up -d
```

| Service | Container port | Host mapping |
| --- | --- | --- |
| PostgreSQL 16 | 5432 | `localhost:5433` |
| Redis 7 | 6379 | `localhost:6379` |
| Elasticsearch 8 | 9200 | `localhost:9200` |

## Environment Variables

Copy `backend/.env.example` to `backend/.env` (or use the root `.env.example`) and fill in the values.

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | Yes | `postgresql://mailflow:mailflow@localhost:5433/mailflow?schema=public` (Render: wired automatically by the Blueprint) |
| `REDIS_HOST` / `REDIS_PORT` | Yes (or `REDIS_URL`) | Redis connection (defaults `localhost:6379`). Add `REDIS_PASSWORD` if the host requires one |
| `REDIS_URL` | No | Full Redis connection string for managed providers (Render Key Value, Upstash, Redis Cloud). Supports `redis://` and TLS `rediss://`. Takes precedence over `REDIS_HOST`/`REDIS_PORT` |
| `ELASTICSEARCH_URL` / `ELASTICSEARCH_INDEX` | Yes | Elasticsearch endpoint + index (`mailflow-emails`) |
| `ELASTICSEARCH_API_KEY` | No | API key for externally hosted Elasticsearch (Elastic Cloud, Bonsai) |
| `FRONTEND_URL` | Yes | Frontend origin for CORS / redirects (`http://localhost:5173`) |
| `SESSION_SECRET` | Yes | Secret used to sign sessions; set a long random value in production |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth credentials |
| `GOOGLE_CALLBACK_URL` | Yes | `http://localhost:5000/api/auth/google/callback` |
| `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` | Yes (for alerts) | Slack app credentials |
| `SLACK_REDIRECT_URI` | Yes (for alerts) | `http://localhost:5000/api/slack/callback` |
| `ETHEREAL_HOST` / `ETHEREAL_PORT` / `ETHEREAL_USER` / `ETHEREAL_PASSWORD` | No | Ethereal SMTP account. When unset, the app mints a throwaway Ethereal test account at runtime |
| `SMTP_HOST` | No | Production SMTP host (e.g. `smtp.gmail.com`). Set together with `SMTP_USER` + `SMTP_PASSWORD` to switch off Ethereal test mode |
| `SMTP_PORT` | No | SMTP port (default `587`; use `465` for implicit TLS) |
| `SMTP_USER` | No | SMTP username / account (e.g. `you@gmail.com`) |
| `SMTP_PASSWORD` | No | SMTP password or app password |
| `SMTP_SECURE` | No | `true` for implicit TLS on port 465, otherwise `false` (STARTTLS — default) |
| `SMTP_ALLOW_ANY_FROM` | No | `true` only for relay/API providers that accept arbitrary From addresses (SendGrid, etc.); default `false` |
| `WORKER_CONCURRENCY` | No | BullMQ worker concurrency (default 5) |
| `MIN_EMAIL_DELAY_MS` | No | Minimum delay between two emails per sender (default 2000) |
| `MAX_EMAILS_PER_HOUR` | No | Hourly send cap per sender (default 100) |

Never commit real credentials. `.env` files are gitignored.

## Google OAuth Setup

1. Create a project in the [Google Cloud Console](https://console.cloud.google.com).
2. Configure the OAuth consent screen and add an OAuth client of type *Web application*.
3. Authorized redirect URI: `http://localhost:5000/api/auth/google/callback`.
4. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_CALLBACK_URL` in `backend/.env`.

Users are created on first sign-in; returning users are matched by Google ID or email.

## Slack OAuth Setup

1. Create an app at [api.slack.com/apps](https://api.slack.com/apps).
2. Add the Bot Token Scope `chat:write` (and `chat:write.public` if you intend to post to public channels).
3. Redirect URL on the Slack app: **`http://localhost:5000/api/slack/callback`** — must match `SLACK_REDIRECT_URI` exactly.
4. Set the credentials in `backend/.env`.

Flow:

| Route | Purpose |
| --- | --- |
| `GET /api/slack/connect` | Starts OAuth with a CSRF state token (requires login) |
| `GET /api/slack/callback` | Validates state, exchanges the code, stores the connection |
| `GET /api/slack/status` | Returns connected status + workspace name (never tokens) |
| `POST /api/slack/disconnect` | Removes the user's Slack connection |

When the hourly rate limit is hit, MailFlow posts one alert per sender per hour window to the connecting Slack user as a direct message. Alerts are deduplicated in Redis (`slack-rate-alert:{userId}:{sender}:{hourWindow}`) so N workers never spam more than one message.

## Email Delivery (SMTP)

MailFlow has two delivery modes, decided entirely by environment variables (never by source changes):

| Mode | When active | Behavior |
| --- | --- | --- |
| **Ethereal (test)** | `SMTP_HOST` / `SMTP_USER` / `SMTP_PASSWORD` not all set | Emails are **accepted** by Ethereal's test SMTP and **never delivered** to real inboxes (Gmail, Outlook, …). The worker logs an Ethereal **preview URL**; the UI shows a test-mode banner and "Open preview" links. Safe for local development. |
| **Production SMTP** | `SMTP_HOST` + `SMTP_USER` + `SMTP_PASSWORD` all set | Emails go out through your provider. Acceptance (`SENT`) is persisted with the provider's `messageId`. The UI labels these as "Accepted by SMTP" rather than claiming inbox delivery. |

To switch modes you only need to set/clear the `SMTP_*` variables — no code or schema changes.

### Gmail SMTP example

1. Enable [2-Step Verification](https://myaccount.google.com/security) on the Google account and create an [App Password](https://myaccount.google.com/apppasswords).
2. In `.env`:

   ```env
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=you@gmail.com
   SMTP_PASSWORD=your-16-char-app-password
   SMTP_SECURE=false
   ```

3. Send from **exactly that Gmail address** (the app enforces this at send time so your campaign can't be bounced by Gmail with a confusing 550/553).

### Other providers

- **Outlook / Office 365:** `SMTP_HOST=smtp.office365.com`, port `587`, `SMTP_USER` + app password.
- **SendGrid:** `SMTP_HOST=smtp.sendgrid.net`, `SMTP_USER=apikey`, `SMTP_PASSWORD=<API key>`. Because the user is API-key style (no `@`), MailFlow skips the local sender check and SendGrid enforces its own domain verification — set `SMTP_ALLOW_ANY_FROM=true` if you send from non-verified addresses and accept SendGrid policy.

### Sender validation

Before sending, MailFlow checks the campaign's From address against the configured account:

- **Ethereal:** any From address is accepted (test inbox).
- **SMTP with an email-shaped user** (Gmail/Outlook): From must match `SMTP_USER`, unless `SMTP_ALLOW_ANY_FROM=true`. Mismatches are rejected up front with a permanent error instead of a Gmail 550/553 bounce.
- **SMTP with an API-key user** (SendGrid): no local check; the provider enforces domain verification.

"Sent" always means the SMTP server *accepted* the message (nodemailer resolved), never "reached the recipient's inbox". Actual delivery depends on the provider's own pipeline (SPF/DKIM, spam filters, inbox rules).

## Ethereal Setup

Ethereal SMTP is used for safe testing (messages can be previewed at the URL logged by the worker). For a persistent account, grab the credentials from [ethereal.email](https://ethereal.email) and set `ETHEREAL_USER` / `ETHEREAL_PASSWORD`. If they are unset, MailFlow creates a fresh test account at startup automatically.

## Elasticsearch Setup

- Started via Docker Compose with security disabled (single-node).
- The API creates the `mailflow-emails` index and mappings on boot.
- Emails are indexed (by document id) when scheduled, sent, and failed.
- Search is strictly isolated: every query filters on the authenticated `userId` term.
- If Elasticsearch is down, search degrades to an empty result with `unavailable: true`; email processing is unaffected.

## Database Migrations

```bash
npm run db:generate   # generate Prisma client
npm run db:migrate    # apply migrations (dev)
npm run db:deploy     # apply migrations (any environment)
```

## Deploy to Render (Blueprint)

Render Blueprint: the `render.yaml` at the repo root provisions **PostgreSQL**, a **Redis-compatible Key Value store**, the **API** (Docker web service), the **email worker** (Docker background worker), and the **frontend** (nginx web service). The nginx container reverse-proxies `/api/*` to the API service, so the app runs on a **single origin** — cookies and OAuth callbacks work without cross-domain hacks.

### What the Blueprint provisions automatically

| Service | Type | Notes |
| --- | --- | --- |
| `mailflow-db` | Render Postgres | `DATABASE_URL` wired to API + worker automatically |
| `mailflow-kv` | Render Key Value | `REDIS_URL` wired to API + worker automatically |
| `mailflow-api` | Docker web service | Runs `prisma migrate deploy` on every deploy, then serves the API on Render's `PORT` |
| `mailflow-worker` | Docker background worker | Runs `node dist/worker.js`, consumes the BullMQ queue |
| `mailflow-ui` | Docker web service | nginx: Vite build + `/api` reverse proxy to the API |

### What you must set up manually

| Item | How |
| --- | --- |
| **Google OAuth** | Create a Google OAuth client, add `https://mailflow-ui.onrender.com/api/auth/google/callback` to **Authorized redirect URIs**, enter `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (prompted at Blueprint creation) |
| **Slack OAuth (optional)** | Slack app with `chat:write`, Redirect URL `https://mailflow-ui.onrender.com/api/slack/callback`, enter `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` |
| **Elasticsearch (optional)** | The app runs fine without ES (search degrades). To enable search, deploy Elasticsearch yourself — e.g. as another Render web service (official image, single-node, `ELASTICSEARCH_URL=<url>:<port>` + optional `ELASTICSEARCH_API_KEY`) or use Elastic Cloud / Bonsai — then add `ELASTICSEARCH_URL` to **both** `mailflow-api` and `mailflow-worker`. Always keep the API/worker envs in sync |
| **SMTP (optional)** | Without SMTP vars the app uses **Ethereal test SMTP**. For real delivery add `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` (+ `SMTP_SECURE`, optional `SMTP_ALLOW_ANY_FROM`) to `mailflow-worker` (and `mailflow-api` if you want the health payload to reflect it). See [Email Delivery](#email-delivery-smtp) |
| `BACKEND_URL` (frontend) | Set in the Blueprint to `https://mailflow-api.onrender.com`. **After first deploy, verify it matches the API service's actual URL** (Render appends a suffix if `mailflow-api` is taken) and update the `mailflow-ui` env var if needed |
| `FRONTEND_URL` / `GOOGLE_CALLBACK_URL` / `SLACK_REDIRECT_URI` (API) | Defaults assume `https://mailflow-ui.onrender.com`. Verify they match the real frontend URL after first deploy |
| `SESSION_SECRET` | Auto-generated by the Blueprint (`generateValue: true`) — no action needed |

### Deploy steps

1. Push this repository to GitHub (e.g. `https://github.com/adeshmishir/MailFlow`).
2. In the [Render Dashboard](https://dashboard.render.com), choose **New → Blueprint** and link the repo.
3. Render reads `render.yaml`, shows the services above, and **prompts for the `sync: false` values** (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`). Fill them in.
4. Click **Apply**. Render creates the DB, Key Value store, and deploys all three services.
5. After the first deploy completes:
   - Open the `mailflow-api` **Logs**; you should see `MailFlow API listening on 0.0.0.0:<PORT>` and no migration errors.
   - Open the `mailflow-worker` **Logs**; you should see `[worker] email worker ready`.
   - Visit `https://mailflow-ui.onrender.com` — you should see the app (and the amber **test-mode banner** if no SMTP is configured yet).
   - Verify api/ui URLs match `BACKEND_URL`, `FRONTEND_URL`, and the OAuth callback URLs; adjust env values if Render assigned different subdomains (then redeploy).
6. (Optional) Provision Elasticsearch and SMTP as described above and add the env vars.

### Production notes

- **Free plan caveats:** free web instances sleep after ~15 min of inactivity (cold start on first visit); free Postgres expires after 30 days; free Key Value has no persistence. Move to paid plans before real use.
- **Migrations are safe:** `prisma migrate deploy` only applies pending migrations, never resets or drops data. Backend and worker wait for nothing special — the worker simply won't have jobs until emails are scheduled.
- **Cookie/session:** the API sets `Secure` + `SameSite=Lax` cookies in production; because the frontend proxies `/api`, everything stays same-origin.
- **CORS:** `FRONTEND_URL` may be a comma-separated list; include `https://mailflow-ui.onrender.com` (and `http://localhost:5173` in dev).

## Running the App

Start infrastructure first, then:

```bash
# Terminal 1 — backend API
npm run backend:dev

# Terminal 2 — BullMQ worker
npm run worker:dev

# Terminal 3 — frontend
npm run frontend:dev
```

- Frontend: http://localhost:5173
- Backend health: http://localhost:5000/api/health
- BullMQ dashboard: http://localhost:5000/api/admin/queues (requires login)

## BullMQ Dashboard

A secure dashboard (Bull Board) is mounted at `GET /api/admin/queues` behind the same session authentication used by the rest of the API. It shows the `email-send` queue's delayed, waiting, active, completed, and failed jobs. Unauthenticated requests return `401`. A machine-readable summary is available at `GET /api/admin/email-queue/stats`.

## Job Lifecycle

1. `POST /api/emails/schedule` creates a Campaign + Email rows (`SCHEDULED`) in one transaction and enqueues one `send-email` BullMQ job per email with `jobId = email.id` (dedup by design).
2. The worker picks up eligible jobs, claims the email via an atomic `SCHEDULED -> PROCESSING` transition, checks the distributed rate limit / min-delay gate, then sends via SMTP and marks the email `SENT` (storing `sentAt`, `deliveryProvider`, `deliveryMessageId`, and — for Ethereal — `deliveryPreviewUrl`) or `FAILED` (storing `error`). Emails already in `SENT`/`FAILED` are never re-sent (idempotent even if BullMQ reprocesses a job), and an email left stuck in `PROCESSING` by a worker that crashed mid-send is resumed instead of abandoned.
3. When the hourly budget is exhausted the job is **delayed, never dropped**; the worker re-enqueues it until the window resets and notifies Slack.
4. `SCHEDULED` emails appear on the Scheduled page; `SENT` emails appear on the Sent page.

## Testing

E2E flows can be exercised against a local Ethereal account: schedule a small campaign, watch the worker logs for the Ethereal preview URL, and confirm the email moves `SCHEDULED` → `SENT` and becomes searchable. Verify auth by hitting `/api/emails/sent` without a session (expect `401`).

## Known Limitations

- Live Slack OAuth and message delivery require real Slack app credentials and an interactive OAuth consent; message delivery to `chat.postMessage` depends on the connected user's DM allowance for the bot.
- Live Google OAuth requires real Google credentials; email/password sign-in is intentionally not implemented.
- Emails are sent through Ethereal (test SMTP) unless `SMTP_HOST` / `SMTP_USER` / `SMTP_PASSWORD` are configured — see [Email Delivery (SMTP)](#email-delivery-smtp).
- Elasticsearch is a search sidecar only — PostgreSQL remains the source of truth.
- The BullMQ dashboard is protected by any logged-in user; role-based admin authorization is not implemented.
- Slack access tokens are stored in PostgreSQL (plaintext) for the prototype; encryption-at-rest is recommended before production.