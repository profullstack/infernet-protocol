# Production image for the Infernet control plane (apps/web).
#
# Multi-stage build. The previous version was broken because:
#   1. The deps stage didn't include pnpm-workspace.yaml or any
#      workspace member package.json files, so `pnpm install` only
#      saw the root deps (vitest) and never installed `next`,
#      `react`, etc. Result: `next: not found` at build time.
#   2. The production stage copied /app/.next + /app/package.json,
#      but the actual Next.js build output lives at
#      /app/apps/web/.next.
#   3. `pnpm start` at root delegates to `pnpm --filter
#      @infernetprotocol/web start`, which needs the workspace
#      structure preserved into the runtime image.
#
# This rewrite preserves the workspace topology end-to-end.

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

# Workspace member manifests (just the package.json files — keeps the
# layer small while giving pnpm enough info to resolve workspace deps).
COPY apps/web/package.json     ./apps/web/package.json
COPY apps/cli/package.json     ./apps/cli/package.json
COPY apps/daemon/package.json  ./apps/daemon/package.json
COPY apps/desktop/package.json ./apps/desktop/package.json
COPY apps/mobile/package.json  ./apps/mobile/package.json

COPY packages/api-schema/package.json       ./packages/api-schema/package.json
COPY packages/auth/package.json             ./packages/auth/package.json
COPY packages/config/package.json           ./packages/config/package.json
COPY packages/db/package.json               ./packages/db/package.json
COPY packages/deploy-providers/package.json ./packages/deploy-providers/package.json
COPY packages/engine/package.json           ./packages/engine/package.json
COPY packages/gpu/package.json              ./packages/gpu/package.json
COPY packages/inference/package.json        ./packages/inference/package.json
COPY packages/logger/package.json           ./packages/logger/package.json
COPY packages/nim-adapter/package.json      ./packages/nim-adapter/package.json
COPY packages/payments/package.json         ./packages/payments/package.json
COPY packages/sdk-js/package.json           ./packages/sdk-js/package.json

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
