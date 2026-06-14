# syntax=docker/dockerfile:1.7
#
# Multi-stage build for Next.js 16 (App Router, standalone output).
#
#   deps      — pnpm install (frozen) with all dependencies
#   builder   — `pnpm build`; Next.js emits .next/standalone + .next/static
#   runtime   — copies only the standalone server tree + static + public
#               into a slim non-root image; runs `node server.js` directly
#
# pnpm is enabled via corepack (single source of truth: package.json's
# `packageManager` field). The runtime stage has no pnpm at all.

# === Stage 1: deps — full install with lockfile ===
FROM node:22-alpine AS deps
WORKDIR /app

# libc6-compat is needed by some npm packages with native binaries
# (sharp's image processing, swc on alpine etc.).
RUN apk add --no-cache libc6-compat

COPY package.json pnpm-lock.yaml ./
RUN corepack enable && \
    pnpm install --frozen-lockfile

# === Stage 2: builder — Next.js production build ===
FROM node:22-alpine AS builder
WORKDIR /app

RUN apk add --no-cache libc6-compat
RUN corepack enable

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production

# Build-time env: config.ts runs at build time and fails fast in production
# if these aren't set. Real runtime values come from ECS task definition
# env / secrets — these placeholders only satisfy build-time validation.
# They never reach the final image (Next.js inlines NEXT_PUBLIC_* but
# everything else stays in process.env at runtime).
ENV USE_MOCK=0 \
    SESSION_SECRET=build-time-placeholder-secret-at-least-32-chars-long \
    BACKEND_API_URL=https://api.example.com \
    REDIS_URL=redis://localhost:6379/0 \
    ALLOWED_ORIGINS=https://www.example.com \
    ENABLE_DEV_LOGIN=0

RUN pnpm build

# === Stage 3: runtime — minimal image ===
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Non-root user — the node:22-alpine image already has uid 1000 `node`,
# but Next.js standalone docs recommend a fresh nextjs user for clarity.
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Standalone tree contains a trimmed node_modules + server.js entrypoint.
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Build metadata — injected by pipeline.yml so /api/health can expose them.
ARG BUILD_GIT_SHA=unknown
ARG BUILD_TIMESTAMP=unknown
ARG BUILD_VERSION=unknown
ENV APP_COMMIT=$BUILD_GIT_SHA \
    BUILD_TIMESTAMP=$BUILD_TIMESTAMP \
    APP_VERSION=$BUILD_VERSION

USER nextjs

EXPOSE 3000

# Standalone server is at /app/server.js (Next.js convention). Running
# `node` directly (PID 1) means SIGTERM goes straight to the process for
# graceful shutdown — no shell wrapper needed.
CMD ["node", "server.js"]
