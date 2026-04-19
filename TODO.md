# Infernet Protocol - TODO List

All application data flows through **Supabase** — operators pick self-hosted (via the Supabase CLI) or cloud (Infernet hosted); the code is identical either way. The Supabase client is server-only: it must be used inside Next.js route handlers and server components, never imported into client components. All JavaScript uses ESM and dependencies are managed with pnpm.

## Next.js API Route Handlers

- [ ] Wire `GET /api/nodes` to Supabase
  - File: `app/api/nodes/route.js`
  - Description: Replace placeholder/mock data with a query against the `nodes` table via `lib/data/infernet.js`.

- [ ] Add `GET /api/nodes/[id]` route
  - File: `app/api/nodes/[id]/route.js`
  - Description: Return a single node by id from Supabase.

- [ ] Wire `GET /api/jobs` to Supabase
  - File: `app/api/jobs/route.js`
  - Description: Query the `jobs` table, support filters (status, provider, client) and pagination.

## Next.js Web Frontend (React)

- [ ] Connect main dashboard to live data
  - File: `app/page.js` and `components/overview-grid.js`
  - Description: The dashboard should consume server component data from `lib/data/infernet.js` (already Supabase-backed) instead of any remaining sample fallbacks.

- [ ] Build GPU monitoring page
  - File: `app/gpu/page.js`
  - Description: React server component that fetches GPU telemetry via a new `/api/gpu` route.

- [ ] Build nodes listing page
  - File: `app/nodes/page.js`
  - Description: Server component that fetches from `/api/nodes` and renders the `ResourceTable` component.

- [ ] Build CPU monitoring page
  - File: `app/cpu/page.js`
  - Description: Server component that fetches CPU telemetry via a new `/api/cpu` route.

## Mobile Application (React Native)

- [ ] Replace mock data in HomeScreen
  - File: `mobile/src/screens/HomeScreen.js`
  - Description: Fetch stats and jobs from the Next.js REST API (which proxies Supabase).

- [ ] Replace mock data in ProvidersScreen
  - File: `mobile/src/screens/ProvidersScreen.js`
  - Description: Fetch provider data from `/api/providers`.

- [ ] Replace mock data in JobsScreen
  - File: `mobile/src/screens/JobsScreen.js`
  - Description: Fetch job data from `/api/jobs`.

## Core Protocol Implementation

- [ ] Replace mock implementation in database statistics utility
  - File: `src/db/utils.js`
  - Description: The `getStats()` function currently returns mock data; replace with a server-side Supabase query (`count` across `nodes`, `jobs`, `providers`, etc.).

## Implementation Strategy

1. Keep the Supabase schema in `supabase/migrations/` as the single source of truth; apply with `supabase db reset` (self-hosted) or `supabase db push` (cloud).
2. Expand `lib/data/infernet.js` with any new query helpers needed by API routes.
3. Update Next.js route handlers to delegate to those helpers.
4. Update React server components and client components to consume the API routes (or use the server-side data helpers directly from server components).
5. Ensure all code uses ESM modules and is managed with pnpm.

## Additional Tasks

- [ ] Document the migration flow for both self-hosted (`supabase db reset`) and cloud (`supabase db push`) deployments.
- [ ] Add authentication for API routes (Supabase Auth + Nostr-linked identities).
- [ ] Implement real-time updates using Supabase Realtime channels, fronted by a Next.js API for mobile clients.
- [ ] Add proper error handling and loading states throughout the React app.
