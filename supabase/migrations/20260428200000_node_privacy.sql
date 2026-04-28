-- Node-level + user-level privacy controls.
--
-- Operators can opt nodes out of public listing (per-node), and set a
-- default for new nodes (global preference). Public-facing pages
-- (/nodes/:id, /status models tables, /api/peers, etc.) MUST honor
-- the per-node flag.

-- Per-node opt-out. Default is_public=true preserves existing behavior
-- (every node is publicly listed unless the operator explicitly hides).
alter table public.providers
    add column if not exists is_public boolean not null default true;

alter table public.aggregators
    add column if not exists is_public boolean not null default true;

alter table public.clients
    add column if not exists is_public boolean not null default true;

-- Per-user default for newly-registered nodes. Stored on the
-- pubkey_links join row so it doesn't require a separate profiles
-- table; reading the most recent link gives the user's current
-- default.
--
-- Behavior: when a daemon registers and the user has at least one
-- pubkey_links row, new providers/aggregators/clients copy the
-- user's default. The daemon can also override per-node via
-- INFERNET_PUBLIC=0 at registration time.
alter table public.pubkey_links
    add column if not exists default_is_public boolean not null default true;

-- Helpful index for /nodes/:id lookups — common case is "find this
-- public node by id".
create index if not exists providers_is_public_idx
    on public.providers (is_public)
    where is_public = true;
