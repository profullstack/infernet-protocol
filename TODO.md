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

## Documentation

- [ ] Document the migration flow for both self-hosted (`supabase db reset`) and cloud (`supabase db push`) deployments.

## Release pipeline (still blocked)

- [ ] Regen npm `NPM_TOKEN` (issued under 2FA → invalid for CI). Revoke + create fresh Automation token at npmjs.com/settings/~/tokens, then `gh secret set NPM_TOKEN`. Homebrew unblocks when npm does.

- [ ] Point `infernet.tech` DNS at the live Next.js deployment so the CLI's default `--url` is meaningful for users who don't self-host.

## Pending stubs / rough edges (carried forward)

- [ ] `apps/cli/lib/chat-executor.js` still emits canned tokens; real llama.cpp / vLLM swap is a contained replacement.
- [ ] `packages/inference/src/distributed/*.js` looks up `settings` / `node_roles` tables that aren't in the migrations — either build the tables or delete the skeleton.
- [ ] `apps/cli/lib/runtime-config.js` still has a legacy `supabase: {}` block (unused). Prune.
- [ ] Triage Dependabot alerts (44 outstanding, mostly pre-existing npm deps).

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
