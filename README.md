# MailFlow

MailFlow is a production-grade email scheduling and delivery system. Users connect Google (OAuth) for sign-in, register sending identities, upload recipient lists, schedule timed campaigns, and get rate-limit alerts delivered to their Slack workspace. All emails are sent through a BullMQ worker via Ethereal SMTP, indexed in Elasticsearch, and stored in PostgreSQL as the source of truth.

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
                     Ethereal SMTP         Slack API
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
| `DATABASE_URL` | Yes | `postgresql://mailflow:mailflow@localhost:5433/mailflow?schema=public` |
| `REDIS_HOST` / `REDIS_PORT` | Yes | Redis connection (defaults `localhost:6379`) |
| `ELASTICSEARCH_URL` / `ELASTICSEARCH_INDEX` | Yes | Elasticsearch endpoint + index (`mailflow-emails`) |
| `FRONTEND_URL` | Yes | Frontend origin for CORS / redirects (`http://localhost:5173`) |
| `SESSION_SECRET` | Yes | Secret used to sign sessions; set a long random value in production |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth credentials |
| `GOOGLE_CALLBACK_URL` | Yes | `http://localhost:5000/api/auth/google/callback` |
| `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` | Yes (for alerts) | Slack app credentials |
| `SLACK_REDIRECT_URI` | Yes (for alerts) | `http://localhost:5000/api/slack/callback` |
| `ETHEREAL_HOST` / `ETHEREAL_PORT` / `ETHEREAL_USER` / `ETHEREAL_PASSWORD` | No | Ethereal SMTP account. When unset, the app mints a throwaway Ethereal test account at runtime |
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
2. The worker picks up eligible jobs, claims the email via an atomic `SCHEDULED -> PROCESSING` transition, checks the distributed rate limit / min-delay gate, then sends via SMTP and marks the email `SENT` (storing `sentAt`) or `FAILED` (storing `error`). Emails already in `SENT`/`FAILED` are never re-sent (idempotent even if BullMQ reprocesses a job), and an email left stuck in `PROCESSING` by a worker that crashed mid-send is resumed instead of abandoned.
3. When the hourly budget is exhausted the job is **delayed, never dropped**; the worker re-enqueues it until the window resets and notifies Slack.
4. `SCHEDULED` emails appear on the Scheduled page; `SENT` emails appear on the Sent page.

## Testing

E2E flows can be exercised against a local Ethereal account: schedule a small campaign, watch the worker logs for the Ethereal preview URL, and confirm the email moves `SCHEDULED` → `SENT` and becomes searchable. Verify auth by hitting `/api/emails/sent` without a session (expect `401`).

## Known Limitations

- Live Slack OAuth and message delivery require real Slack app credentials and an interactive OAuth consent; message delivery to `chat.postMessage` depends on the connected user's DM allowance for the bot.
- Live Google OAuth requires real Google credentials; email/password sign-in is intentionally not implemented.
- Emails are sent through Ethereal (test SMTP), not a real production SMTP provider.
- Elasticsearch is a search sidecar only — PostgreSQL remains the source of truth.
- The BullMQ dashboard is protected by any logged-in user; role-based admin authorization is not implemented.
- Slack access tokens are stored in PostgreSQL (plaintext) for the prototype; encryption-at-rest is recommended before production.