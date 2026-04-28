# syntax=docker/dockerfile:1.7-labs
#
# Production image for the Infernet control plane (apps/web).
#
# Multi-stage build that preserves pnpm's workspace topology end-to-end.
# Workspace manifests are copied via BuildKit's `COPY --parents` glob
# so adding a new packages/* member doesn't require a Dockerfile edit
# (and we never recreate the bug where a missing manifest hung
# `pnpm install --frozen-lockfile` for an hour on Railway).

# ---------------------------------------------------------------------------
# Base — corepack-managed pnpm so the version is pinned & reproducible.
# ---------------------------------------------------------------------------
FROM node:20-alpine AS base
WORKDIR /app
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH
RUN corepack enable && corepack prepare pnpm@10.6.5 --activate

# ---------------------------------------------------------------------------
# Deps — install everything @infernetprotocol/web's dep cone needs.
#
# pnpm needs to see the WHOLE workspace topology (workspace yaml +
# every member package.json) to resolve `workspace:*` references,
# even when filtering. We copy manifests + lockfile only at this
# stage so we don't bust the layer cache on every source-code change.
# ---------------------------------------------------------------------------
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./

# Every workspace member's package.json, in one shot, with directory
# structure preserved (`--parents` is a BuildKit feature — see syntax
# directive at the top). Source-code changes in apps/*/src or
# packages/*/src do NOT bust this layer's cache because we only pull
# in package.json files here. New workspace members are picked up
# automatically.
COPY --parents apps/*/package.json packages/*/package.json ./

# Only install what apps/web needs (and its workspace deps).
RUN pnpm install --frozen-lockfile --filter @infernetprotocol/web...

# ---------------------------------------------------------------------------
# Builder — copy installed node_modules + source, run next build.
# ---------------------------------------------------------------------------
FROM base AS builder

# Bring in the installed workspace from the deps stage (preserves
# pnpm's symlink topology under /app/node_modules and
# /app/apps/web/node_modules).
COPY --from=deps /app /app

# Now copy the source over the manifests we already used.
COPY apps/web      ./apps/web
COPY packages      ./packages

RUN pnpm --filter @infernetprotocol/web build

# ---------------------------------------------------------------------------
# Production — minimal runtime image.
#
# Future optimization: switch apps/web/next.config.js to
# `output: 'standalone'` and copy only the standalone output. For now
# we keep the workspace tree intact so `pnpm start` works directly.
# ---------------------------------------------------------------------------
FROM base AS production
ENV NODE_ENV=production \
    PORT=8080 \
    HOSTNAME=0.0.0.0

COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder /app/pnpm-lock.yaml      ./pnpm-lock.yaml
COPY --from=builder /app/package.json        ./package.json
COPY --from=builder /app/apps/web            ./apps/web
COPY --from=builder /app/packages            ./packages
COPY --from=builder /app/node_modules        ./node_modules

EXPOSE 8080

# pnpm --filter resolves the workspace and runs `next start` in
# /app/apps/web with the right node_modules on PATH.
CMD ["pnpm", "--filter", "@infernetprotocol/web", "start"]
