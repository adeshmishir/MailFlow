# MailFlow

MailFlow is a production-grade email scheduling and delivery system. It lets users connect their Gmail (Google OAuth) and Slack accounts, upload recipient lists, and schedule timed email campaigns with rate limiting, Elasticsearch search indexing, and Slack rate-limit alert notifications.

> **Status:** Phase 5 Complete — Elasticsearch search indexing, email search API, Slack OAuth integration & rate-limit notifications implemented and verified.

## Tech Stack

- **Frontend:** React, Vite, TypeScript, Tailwind CSS
- **Backend:** Node.js, Express, TypeScript
- **Database:** PostgreSQL via Prisma ORM
- **Queue:** BullMQ + Redis
- **Search:** Elasticsearch (`@elastic/elasticsearch`)
- **Notifications:** Slack Web API (`chat:write`)
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
                         Worker
                           |
                           +-------------------+
                           |                   |
                           v                   v
                     Ethereal SMTP         Slack API
```

The API server and the worker run as separate processes. PostgreSQL remains the authoritative source of truth, while Elasticsearch acts as a high-performance search index.

## Phase 5 Features

### 1. Elasticsearch Email Search & Indexing
- Automatic non-blocking Elasticsearch document creation when emails are scheduled, sent, or fail.
- Stable document ID (`Email.id`) prevents duplicate documents upon status synchronization.
- **Search API:** `GET /api/emails/search?q=query&status=SENT&page=1&pageSize=20`
- **Security & User Isolation:** Every query enforces `filter: [{ term: { userId } }]`. Users can only search their own indexed emails.
- **Graceful Fallback:** If Elasticsearch is offline or unreachable, search returns an empty state with an `unavailable: true` indicator without crashing email processing.

### 2. Slack OAuth & Connection Management
- Server-side OAuth flow with state CSRF protection:
  - `GET /api/slack/connect` -> Starts OAuth flow with `chat:write` scope
  - `GET /api/slack/callback` -> Validates CSRF state, exchanges code for access token
  - `POST /api/slack/disconnect` -> Deletes user's Slack connection
  - `GET /api/slack/status` -> Returns connection status and workspace team name (access tokens are never exposed to the frontend)

### 3. Rate-Limit Slack Alerts with Distributed Deduplication
- When an email send is blocked because the hourly limit is reached (`count > MAX_EMAILS_PER_HOUR`), the BullMQ job is delayed/rescheduled without dropping or marking as failed.
- A Slack notification is automatically posted to the user's workspace:
  > *"⚠️ MailFlow rate limit reached for sender X. Email processing has been delayed and will resume when allowed."*
- **Notification Spam Protection:** Uses a distributed Redis lock key `slack-rate-alert:{userId}:{senderId}:{hourWindow}` with a 1-hour TTL to ensure only 1 notification is sent per sender per rate-limit window, preventing spam across multiple worker instances.

## Environment Variables

See `.env.example` for full list. Key Phase 5 variables:

| Variable | Description |
| --- | --- |
| `ELASTICSEARCH_URL` | Local Elasticsearch endpoint (`http://localhost:9200`) |
| `ELASTICSEARCH_INDEX` | Index name for email documents (`mailflow-emails`) |
| `SLACK_CLIENT_ID` | Slack OAuth Client ID |
| `SLACK_CLIENT_SECRET` | Slack OAuth Client Secret |
| `SLACK_REDIRECT_URI` | Slack OAuth Redirect URI (`http://localhost:5000/api/slack/callback`) |

## Local Setup

1. Start infrastructure:
   ```bash
   docker compose up -d
   ```
2. Apply database migrations:
   ```bash
   npm run db:migrate
   ```
3. Start backend API:
   ```bash
   npm run backend:dev
   ```
4. Start worker process:
   ```bash
   npm run worker:dev
   ```
5. Start frontend app:
   ```bash
   npm run frontend:dev
   ```

## Development Status & Verification

- [x] Elasticsearch connection, index mapping & initialization verified live on Docker container
- [x] Email document indexing, search, and strict user isolation verified live
- [x] Non-blocking search fallback verified
- [x] Slack OAuth connection, status, disconnect APIs implemented and typechecked
- [x] Rate-limit detection and Redis distributed notification deduplication verified
- [x] Frontend Slack Status & Email Search cards implemented
- [x] Backend and Frontend builds & typechecks passing (0 errors)
- [!] Live Slack OAuth code exchange requires real Slack App Client ID/Secret in environment