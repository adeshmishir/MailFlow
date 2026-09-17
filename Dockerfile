# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────────────────────
# MailFlow multi-stage Dockerfile.
#
# Buildable targets:
#   backend   → Node 20 runtime for the Express API AND the BullMQ worker
#               (the worker simply overrides CMD to `node dist/worker.js`)
#   frontend  → nginx serving the Vite build, reverse-proxying /api → backend
#
# Base image is Node 20 on Debian bookworm-slim (glibc) because Prisma's
# binary engines are glibc-linked; alpine/musl builds of Prisma are fragile.
# ─────────────────────────────────────────────────────────────────────────────

# ---------- Base image shared by every stage ----------
FROM node:20-bookworm-slim AS base
WORKDIR /app

# ---------- Install ALL dependencies (including dev tools) ----------
FROM base AS deps
ENV NODE_ENV=development
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
# Schema must exist before npm ci so the @prisma/client postinstall can generate.
COPY backend/prisma backend/prisma
# The @prisma/client postinstall cannot locate the schema from the monorepo
# root, so it generates an empty client. Regenerate explicitly from the
# correct schema path so `tsc --build` sees the real model types.
RUN npm ci \
    && npx prisma generate --schema backend/prisma/schema.prisma

# ---------- Compile backend (tsc) and build frontend (tsc + vite) ----------
FROM deps AS build
COPY backend/tsconfig.json backend/tsconfig.json
COPY backend/worker.ts backend/worker.ts
COPY backend/src backend/src
RUN npm run build --workspace backend
COPY frontend/tsconfig.json frontend/tsconfig.json
COPY frontend/vite.config.ts frontend/vite.config.ts
COPY frontend/index.html frontend/index.html
COPY frontend/public frontend/public
COPY frontend/src frontend/src
RUN npm run build --workspace frontend

# ---------- Production-only dependencies + generated Prisma client ----------
FROM base AS proddeps
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY backend/prisma backend/prisma
RUN npm ci --omit=dev --workspaces \
    && npx prisma generate --schema backend/prisma/schema.prisma

# ---------- Backend / worker runtime ----------
FROM base AS backend
ENV NODE_ENV=production
RUN mkdir -p backend frontend
COPY --from=proddeps --chown=node:node /app/node_modules ./node_modules
COPY --from=proddeps --chown=node:node /app/backend/prisma ./backend/prisma
COPY --from=build --chown=node:node /app/backend/dist ./backend/dist
COPY backend/package.json backend/package.json
USER node
WORKDIR /app/backend
EXPOSE 5000
# Default start for the API: apply pending Prisma migrations, then exec the
# compiled server only if they succeeded (`exec` preserves signals so Render
# can shut down gracefully). Render's Free tier has no preDeployCommand, so
# migrations run here at container start; local docker-compose.prod.yml uses
# a separate one-shot `migrate` service and the same idempotent command.
# The worker overrides CMD (Render dockerCommand / compose `command`) with
# `node dist/worker.js` and therefore never runs migrations.
CMD ["sh", "-c", "npx prisma migrate deploy --schema prisma/schema.prisma && exec node dist/src/server.js"]

# ---------- Frontend runtime ----------
# Serves the Vite build with nginx and reverse-proxies /api to the Express
# API. The port and API origin are injected at container start via envsubst
# (/etc/nginx/templates), so the same image works for docker-compose.prod.yml
# (backend:5000 on the Docker network) and Render (a public URL).
FROM nginx:1.27-alpine AS frontend
ENV PORT=80
ENV BACKEND_URL=http://backend:5000
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80