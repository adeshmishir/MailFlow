# MailFlow

MailFlow is a production-grade email scheduling and delivery system. It lets users connect their Gmail (Google OAuth) and Slack accounts, upload recipient lists, and schedule timed email campaigns with rate limiting.

> **Status:** Phase 1 complete — project foundation only. Scheduling APIs, email delivery, integrations, and the dashboard are not implemented yet.

## Tech Stack

- **Frontend:** React, Vite, TypeScript, Tailwind CSS
- **Backend:** Node.js, Express, TypeScript
- **Database:** PostgreSQL via Prisma ORM
- **Queue:** BullMQ + Redis
- **Search:** Elasticsearch (infrastructure only, implementation later)
- **Infrastructure:** Docker Compose

## Architecture

```text
React Frontend
       |
       | REST API
       v
Express API Server
       |
       +-------------------+
       |                   |
       v                   v
 PostgreSQL              Redis
 Source of Truth        BullMQ Queue
                           |
                           v
                        Worker
                           |
                           v
                     Ethereal SMTP
```

The API server and the worker are separate processes. Worker logic never lives inside Express request handlers.

## Project Structure

```text
mailflow/
├── backend/
│   ├── prisma/
│   │   └── schema.prisma
│   ├── src/
│   │   ├── config/          # env validation + Prisma client
│   │   ├── middleware/      # error handling
│   │   ├── routes/          # HTTP routes
│   │   ├── queues/          # BullMQ queue setup
│   │   ├── workers/         # worker processing logic
│   │   ├── app.ts           # Express app setup
│   │   └── server.ts        # HTTP server startup
│   └── worker.ts            # worker process entry point
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/        # API client
│   │   ├── hooks/
│   │   ├── types/
│   │   ├── App.tsx
│   │   └── main.tsx
│   └── ...
├── docker-compose.yml
├── .env.example
└── package.json
```

## Local Setup

Prerequisites: Node.js 20+, Docker with Docker Compose, npm.

1. Clone the repository.
2. Copy the environment template:

   ```bash
   cp .env.example backend/.env
   ```

3. Install dependencies from the repo root:

   ```bash
   npm install
   ```

## Environment Variables

See `.env.example` for the full list with descriptions. Key variables:

| Variable | Description |
| --- | --- |
| `PORT` | API server port (default `5000`) |
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_HOST` / `REDIS_PORT` | Redis used by BullMQ |
| `ELASTICSEARCH_URL` | Local Elasticsearch endpoint |
| `FRONTEND_URL` | Frontend origin |
| `WORKER_CONCURRENCY` | Number of jobs a worker processes at once |
| `GOOGLE_*` / `SLACK_*` / `ETHEREAL_*` | Placeholders for later phases |

## Running Infrastructure

```bash
docker compose up -d
```

Starts PostgreSQL, Redis, and Elasticsearch with persistent volumes. Verify:

```bash
docker compose ps
```

## Running Backend

```bash
npm run db:generate   # generate Prisma client
npm run db:migrate    # apply initial migration
npm run backend:dev   # start the API on http://localhost:5000
```

Check: `curl http://localhost:5000/api/health` → `{"status":"ok","service":"mailflow-api"}`

## Running Worker

```bash
npm run worker:dev
```

Starts the BullMQ worker as a separate process.

## Running Frontend

```bash
npm run frontend:dev   # http://localhost:5173
```

## Current Development Status

**Backend**

- [x] TypeScript + Express app with `/api/health`
- [x] Centralized env config with validation
- [x] Prisma schema (User, Sender, Campaign, Email, SlackConnection) + migration
- [x] BullMQ `email-send` queue skeleton
- [x] Standalone worker process
- [ ] OAuth, email sending, scheduling, Elasticsearch indexing, rate limiting

**Frontend**

- [x] React + Vite + TypeScript + Tailwind
- [x] Placeholder page wired to the health endpoint via Vite proxy
- [ ] Dashboard UI (later phases)

**Infrastructure**

- [x] Docker Compose: PostgreSQL, Redis, Elasticsearch