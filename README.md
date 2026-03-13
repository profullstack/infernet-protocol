# Infernet Protocol

This repository now runs as a single Next.js application with:

- Next.js App Router for UI and API routes
- Local open-source Supabase as the database/backend
- Tailwind CSS for styling
- Vitest for tests
- Electron for the desktop shell in `desktop/`

The active web/runtime is the root Next.js app. The desktop target remains Electron and loads that Next.js app as its renderer.

## Stack

- Runtime: Node.js 18+
- Framework: Next.js
- Database: local open-source Supabase
- Styling: Tailwind CSS
- Testing: Vitest
- Desktop: Electron

## Key rule

Supabase is server-only in this rewrite.

- Use `SUPABASE_SERVICE_ROLE_KEY` only from server modules and route handlers.
- Do not import `@supabase/supabase-js` into client components.
- Do not expose Supabase anon keys in browser bundles.

## Project layout

```text
app/                     Next.js pages and route handlers
components/              UI building blocks
lib/                     Server-only env, Supabase, and data access helpers
desktop/                 Electron shell for the desktop app
supabase/migrations/     SQL schema for local Supabase
tests/                   Vitest coverage for env, data mapping, and route helpers
```

## Environment

Copy `sample.env` into `.env.local` and set:

```bash
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=your-local-service-role-key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Local Supabase setup

Start the local open-source Supabase stack first:

```bash
pnpm supabase:start
```

Then copy the local service-role key from `supabase status` into `.env.local`.

Apply the migration in [supabase/migrations/20260312000000_initial_infernet_schema.sql](/home/ettinger/src/profullstack.com/infernet-protocol/supabase/migrations/20260312000000_initial_infernet_schema.sql). It creates:

- `nodes`
- `providers`
- `aggregators`
- `clients`
- `models`
- `jobs`

The migration also seeds a small dataset for local validation.

## Development

Install dependencies and run the app:

```bash
pnpm install
pnpm supabase:start
pnpm dev
```

Useful commands:

```bash
pnpm build
pnpm start
pnpm supabase:db:reset
pnpm supabase:stop
pnpm test
```

Desktop commands:

```bash
cd desktop
pnpm electron:dev
pnpm electron:start
```

## API routes

The current server API surface is:

- `GET /api/overview`
- `GET /api/nodes`
- `GET /api/jobs`
- `GET /api/providers`
- `GET /api/aggregators`
- `GET /api/clients`
- `GET /api/models`

Each route reads from Supabase through `lib/data/infernet.js`, which is marked server-only by dependency chain.
