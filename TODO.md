# Infernet Protocol — TODO List

All application data flows through **Supabase** — operators pick self-hosted (via the Supabase CLI) or cloud (Infernet hosted); the code is identical either way. The Supabase client is server-only: it must be used inside Next.js route handlers and server components, never imported into client components. All JavaScript uses ESM and dependencies are managed with pnpm.

## Auth / API

- [ ] Extend signed-request auth to read routes
  - Files: `apps/web/app/api/{overview,nodes,jobs,providers,peers}/route.js`
  - Description: `/api/v1/node/*` already enforces Nostr-signed requests; the legacy read routes are still unauthenticated. Wire them through `apps/web/lib/auth/verify-signed-request.js` so operators can scope views to an identity.

## Realtime + UX

- [ ] Broaden Supabase Realtime beyond chat streaming
  - Description: `chat-stream` (`apps/web/lib/data/chat-stream.js`, `app/api/chat/stream/[jobId]/route.js`) already uses Supabase Realtime. Extend to dashboard / nodes / jobs surfaces so operators see live status without polling.

- [ ] Tighten error + loading states across the React app
  - Description: Audit server components and client fetchers for missing skeletons / error boundaries; the dashboard auto-refresh path is the most visible offender today.


---

## Recently shipped (removed from TODO)

The following items were on TODO.md but are live in master:

- `GET /api/nodes`, `GET /api/nodes/[id]`, `GET /api/jobs` — all Supabase-backed via `apps/web/lib/data/infernet.js`.
- `/dashboard` (and the new `/dashboard` server component) consumes `lib/data/dashboard` — no sample fallbacks.
- `/nodes` listing page — `apps/web/app/nodes/page.js` (+ `[id]`) is live.
- `/gpu` and `/cpu` fleet pages + `/api/gpu` and `/api/cpu` JSON endpoints — shipped 2026-05-03 (commit `12d49db`).
- Mobile `HomeScreen` / `JobsScreen` / `ProvidersScreen` now fetch real data from the Next.js API via `apps/mobile/src/lib/api.js` — shipped 2026-05-03 (commit `b0e128d`).
- `getStats()` in `packages/db/src/utils.js` runs real `count` queries against Supabase.
- Nostr / BIP-340 signature auth on `/api/v1/node/*` — shipped 2026-04-19.
- IPIP-0030 + IPIP-0031 proposal docs written; `ipips/README.md` index regenerated; 24 shipped IPIPs promoted out of `Draft` — shipped 2026-05-03 (commit `3314fd2`).
- Dead post-Phase-1 code deleted: `packages/inference/` (superseded by Petals / IPIP-0031), `apps/cli/lib/runtime-config.js` (legacy `supabase: {}` block + 12 other unused sections), `apps/cli/examples/app.js` (used the removed CLI Supabase client) — shipped 2026-05-03.
- Migration flow documented in `docs/MIGRATIONS.md` — covers `supabase db reset` (self-hosted), `supabase db push` (cloud), adding new migrations, and conventions — shipped 2026-05-03.
- Dependabot triage — 0 open alerts (78 fixed, 1 dismissed of 79 historical). Hardened `ip` to 2.0.1 via `pnpm.overrides`; documented the residual `pnpm audit` warning + RN-tooling reachability rationale in `docs/SECURITY.md` — shipped 2026-05-03.
- v0.1.41 cut and published 2026-05-03: every public `@infernetprotocol/*` package live on npm at `0.1.41`, `ghcr.io/infernetprotocol/infernet-provider:0.1.41` + `:latest` pushed (multi-arch), GitHub Release at `v0.1.41` with Homebrew formula attached. npm pipeline is unblocked.
