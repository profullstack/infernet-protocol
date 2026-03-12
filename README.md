# Infernet Protocol

This repository now runs as a single Next.js application with:

- Next.js App Router for UI and API routes
- Supabase Cloud as the only database/backend
- Tailwind CSS for styling
- Vitest for tests
- Electron for the desktop shell in `desktop/`

The active web/runtime is the root Next.js app. The desktop target remains Electron and loads that Next.js app as its renderer.

## Stack

- Runtime: Node.js 18+
- Framework: Next.js
- Database: Supabase Cloud
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
supabase/migrations/     SQL schema for Supabase Cloud
tests/                   Vitest coverage for env, data mapping, and route helpers
```

## Environment

Copy `sample.env` into `.env.local` and set:

```bash
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Database setup

Apply the migration in [supabase/migrations/20260312000000_initial_infernet_schema.sql](/home/ettinger/src/profullstack.com/infernet-protocol/supabase/migrations/20260312000000_initial_infernet_schema.sql) to your Supabase project. It creates:

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
pnpm dev
```

Useful commands:

```bash
pnpm build
pnpm start
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
