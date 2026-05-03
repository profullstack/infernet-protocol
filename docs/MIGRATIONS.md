# Database Migrations

The Infernet control plane uses **Supabase** (Postgres + Auth + Realtime). All schema is checked into `supabase/migrations/` as raw SQL files and applied via the Supabase CLI. The same files run identically against a local self-hosted Supabase stack and against a Supabase Cloud project — operators pick one, the code path is identical either way.

## Layout

```
supabase/
└── migrations/
    ├── 20260312000000_initial_infernet_schema.sql
    ├── 20260419000000_cli_support_and_payments.sql
    ├── 20260420000000_chat_interface.sql
    ├── 20260426000000_auth_and_pubkey_links.sql
    ├── 20260426010000_cpr_receipts.sql
    ├── 20260428000000_drop_demo_seeds.sql
    ├── 20260428100000_node_commands.sql
    ├── 20260428200000_node_privacy.sql
    ├── 20260430000000_e2e_chat.sql
    ├── 20260430010000_model_pubkey.sql
    ├── 20260501130000_node_commands_progress.sql
    └── 20260501170000_training_market.sql
```

Filenames are `YYYYMMDDHHMMSS_<short_name>.sql` — Supabase orders migrations lexically by filename, so the timestamp prefix doubles as the apply order.

There is no `seed.sql`. Seeds for development data are written from CLI / dashboard flows (e.g. `infernet init`), not from a SQL file.

## Prerequisites

- **Supabase CLI** — install once per machine: `npm install -g supabase` (or `brew install supabase/tap/supabase`).
- **Docker** — required only for the self-hosted path (`supabase start` runs Postgres + Auth + Studio in containers).
- **Project ref** — required only for the cloud path (the slug from `https://app.supabase.com/project/<ref>`).

The package.json wraps the common Supabase commands as `pnpm` scripts:

```jsonc
"supabase:start":     "supabase start",
"supabase:stop":      "supabase stop",
"supabase:db:reset":  "supabase db reset",
"supabase:login":     "supabase login",
"supabase:link":      "supabase link",
"supabase:db:push":   "supabase db push"
```

Use the script form (`pnpm supabase:db:reset`) or call the CLI directly — they're identical.

## Self-hosted flow

For local development, a private network, or full data sovereignty:

```bash
# 1. Boot Postgres + Auth + Realtime + Studio in Docker
pnpm supabase:start
# Outputs:
#   API URL:    http://127.0.0.1:54321
#   DB URL:     postgresql://postgres:postgres@127.0.0.1:54322/postgres
#   Studio URL: http://127.0.0.1:54323
#   anon key:   eyJ...
#   service_role key: eyJ...

# 2. Apply every migration from scratch
pnpm supabase:db:reset
```

`supabase db reset` is the canonical "rebuild from migrations" command. It:

1. Drops the local `postgres` database.
2. Re-creates it.
3. Runs every file in `supabase/migrations/` in lexical order.

Use it whenever you've added a migration, switched branches, or want a clean slate. It's safe — there is nothing to preserve in the local Postgres beyond what the migrations recreate.

To wire the Next.js app to the local stack, copy the printed URLs and keys into `apps/web/.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from supabase start>
SUPABASE_SERVICE_ROLE_KEY=<service_role key from supabase start>
```

Stop the stack with `pnpm supabase:stop`. Containers persist between runs by default, but `supabase db reset` is idempotent against either fresh or existing containers.

## Cloud flow

For Supabase Cloud (the easiest production path):

```bash
# 1. One-time per machine
pnpm supabase:login
# Opens a browser; pastes a personal access token

# 2. One-time per checkout
pnpm supabase:link --project-ref <your-project-ref>
# Stores the project ref in supabase/.temp/project-ref

# 3. Every time you (or a teammate) added migrations
pnpm supabase:db:push
```

`supabase db push` diffs `supabase/migrations/` against the remote project's `supabase_migrations.schema_migrations` table and applies any files the remote hasn't seen yet — in lexical order. **It does not drop or rebuild anything.** Already-applied files are skipped.

If push fails partway through (e.g. a migration references a table that hasn't been created yet because a dependency was reordered), Supabase reports which file failed and stops. Fix the SQL, re-run; nothing is lost.

To configure the deployed Next.js app, paste the cloud URLs and keys into the deployment platform's secrets:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from app.supabase.com>
SUPABASE_SERVICE_ROLE_KEY=<service_role key from app.supabase.com>
```

## Adding a new migration

```bash
# Bootstrap a new file with the right timestamp prefix
supabase migration new add_my_feature
# → creates supabase/migrations/<timestamp>_add_my_feature.sql

# Edit the SQL...

# Apply locally and confirm the schema is what you expected
pnpm supabase:db:reset

# Smoke-test against the running app
pnpm dev   # in apps/web

# Commit BOTH the migration file and any code changes that depend on it
git add supabase/migrations/<timestamp>_add_my_feature.sql apps/web/...
git commit
```

### Conventions

- **One concern per migration.** Don't bundle "add CPR table" and "add training-market columns" in the same file — they should fail / succeed independently.
- **Idempotency where free** — `create table if not exists`, `create index if not exists`, etc. The `if not exists` clauses make `db push` against a partially-applied remote tolerant.
- **Don't edit a merged migration.** If migration `20260420000000_X.sql` is already on master and a teammate has it applied, edit a *new* migration to alter / drop / re-add. The exception is hot-fix-before-anyone-pulls — confirm with `git log -- supabase/migrations/<file>` first.
- **Reference the IPIP** — top-of-file comment mentioning the IPIP that motivates the schema (e.g. `-- IPIP-0030` for the training market) so future readers can find the design doc.

## Resetting cloud (rare)

`supabase db reset` is local-only. To rebuild a cloud project from scratch you'd:

1. **Don't.** A cloud reset wipes operator data, payment history, CPR receipts, and Auth users.
2. If you really must (dev / staging only): delete the project in the Supabase dashboard, create a new one with the same project ref (or update env vars), `supabase link --project-ref <new ref>`, `supabase db push`.

There is no destructive operation against a cloud project that the Supabase CLI offers without a confirmation prompt.

## CI

Migrations are **not** applied by CI today. The release workflow (`.github/workflows/release.yml`) publishes packages and Docker images; it does not touch any database. Migrations are operator-applied on each deployment, on the schedule the operator chooses.

If you ever wire migration push into CI: gate it on tags only (`v*.*.*`), require an explicit `gh secret set SUPABASE_ACCESS_TOKEN`, and run `supabase db push` against the project ref of the deployment being shipped — never against multiple environments in one job.

## See also

- `docs/book/06-advanced/self-hosting.md` — the operator's guide for standing up a private control plane (covers Supabase Cloud + Vercel, plus the local-Docker variant).
- `supabase/migrations/` — the canonical migration history.
