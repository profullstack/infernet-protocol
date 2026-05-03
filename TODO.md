# Infernet Protocol — TODO List

All application data flows through **Supabase** — operators pick self-hosted (via the Supabase CLI) or cloud (Infernet hosted); the code is identical either way. The Supabase client is server-only: it must be used inside Next.js route handlers and server components, never imported into client components. All JavaScript uses ESM and dependencies are managed with pnpm.

## Web frontend

- [ ] Build GPU monitoring page
  - File: `apps/web/app/gpu/page.js` (+ `apps/web/app/api/gpu/route.js`)
  - Description: Server component that fetches GPU telemetry — vendor / VRAM tier / model counts derived from `nodes.gpus` JSON. No `/gpu` route exists today.

- [ ] Build CPU monitoring page
  - File: `apps/web/app/cpu/page.js` (+ `apps/web/app/api/cpu/route.js`)
  - Description: Server component that fetches CPU telemetry. No `/cpu` route exists today.

## Mobile application (React Native, `apps/mobile`)

- [ ] Replace mock data in HomeScreen
  - File: `apps/mobile/src/screens/HomeScreen.js`
  - Description: Currently generates `mockJobs` locally. Fetch stats and recent jobs from the Next.js REST API.

- [ ] Replace mock data in ProvidersScreen
  - File: `apps/mobile/src/screens/ProvidersScreen.js`
  - Description: Currently generates `mockProviders`. Fetch from `/api/providers`.

- [ ] Replace mock data in JobsScreen
  - File: `apps/mobile/src/screens/JobsScreen.js`
  - Description: Currently generates `mockJobs`. Fetch from `/api/jobs`.

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

## IPIPs — index + status hygiene

- [ ] `ipips/README.md` index lists only IPIP-0001 through 0008 — directory has 0001–0028 plus references to 0030/0031 in commit history. Regenerate the index and reflect actual status (most are shipped, not Draft).

- [ ] Write up IPIP-0030 (open-market training) and IPIP-0031 (Petals federated inference). Both ship in the codebase (commits `1012903`, `8f40ac5`, `638597c`, `2cd5cd5`) but no proposal doc exists.

- [ ] Promote shipped IPIPs out of `Draft` in their frontmatter. Candidates with code support:
  - 0003 (auth — Phase 1 Nostr signed requests live)
  - 0007 (CPR — receipts + queue drain shipped)
  - 0009 (engine adapter protocol — Ollama / vLLM / NIM all on the same NDJSON contract)
  - 0013 (batch decomposition — BullMQ + Ray live)
  - 0014 (distributed-systems primitives — shipped)
  - 0019 (pricing-aware deploy — RunPod + Vast + 6 more providers shipped)
  - 0021 (IDL / RMI Milestone 1 — protos + docs shipped)
  - 0024 (token-chunk batching for streaming — shipped)
  - 0025 (at-rest prompt encryption — shipped)
  - 0026 / 0027 / 0028 (prompt privacy + NIP-44 E2E + multi-party keys — Phase 1 shipped)

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
- `getStats()` in `packages/db/src/utils.js` runs real `count` queries against Supabase.
- Nostr / BIP-340 signature auth on `/api/v1/node/*` — shipped 2026-04-19.
