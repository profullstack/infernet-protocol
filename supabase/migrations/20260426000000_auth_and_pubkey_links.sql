-- IPIP-0003 phase 1: schema for the two-tier auth model.
--
-- Adds:
--   pubkey_links   maps Supabase auth.users.id ↔ Nostr pubkeys
--                  (so a logged-in human can claim ownership of one
--                  or more daemon identities)
--   cli_sessions   ephemeral state for the CLI device-code flow
--                  (`infernet auth login` polls until authorized)
--
-- Spec: ipips/ipip-0003.md.

-- ---------------------------------------------------------------------------
-- pubkey_links
-- ---------------------------------------------------------------------------
create table if not exists public.pubkey_links (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  pubkey      text        not null check (length(pubkey) = 64),
  role        text        not null check (role in ('provider', 'aggregator', 'client')),
  label       text,
  created_at  timestamptz not null default now(),
  unique (pubkey, role)
);

create index if not exists pubkey_links_user_id_idx
  on public.pubkey_links (user_id);

create index if not exists pubkey_links_pubkey_idx
  on public.pubkey_links (pubkey);

comment on table  public.pubkey_links is
  'IPIP-0003: links a Supabase auth.users row to one or more Nostr pubkeys after the link-challenge ceremony succeeds.';
comment on column public.pubkey_links.role  is 'provider | aggregator | client — same vocabulary as the providers/aggregators/clients tables.';
comment on column public.pubkey_links.label is 'Optional human-readable label, e.g. "tokyo-vps-1". Free-form.';

-- ---------------------------------------------------------------------------
-- cli_sessions
-- ---------------------------------------------------------------------------
create table if not exists public.cli_sessions (
  code           text        primary key,
  user_id        uuid        references auth.users(id) on delete cascade,
  authorized_at  timestamptz,
  consumed_at    timestamptz,
  expires_at     timestamptz not null,
  created_at     timestamptz not null default now()
);

create index if not exists cli_sessions_expires_at_idx
  on public.cli_sessions (expires_at);

comment on table  public.cli_sessions is
  'IPIP-0003: short-lived sessions for the CLI device-code login flow. Codes expire in ~10 minutes and are deleted after consumption to prevent replay.';

-- ---------------------------------------------------------------------------
-- RLS — keep these tables service-role-only for now. Both flows go
-- through server routes; no client-side reads.
-- ---------------------------------------------------------------------------
alter table public.pubkey_links enable row level security;
alter table public.cli_sessions enable row level security;

-- No policies = no row visibility for non-service-role clients.
-- Server-side queries via the service-role key bypass RLS as designed.
