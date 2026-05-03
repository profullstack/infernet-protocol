-- IPIP-search: centralized search proxy + per-pubkey rate limiting.
--
-- Operators no longer need their own VALUESERP_API_KEY — `infernet train data`
-- calls /api/v1/search on the control plane, which holds the platform key and
-- enforces a daily quota per Nostr pubkey using this table.

create table if not exists public.search_usage (
    id            bigserial primary key,
    pubkey        text        not null,           -- 64-char hex Nostr x-only pubkey
    query         text        not null,
    num_requested int         not null default 20,
    num_returned  int         not null default 0,
    domains       text[],
    created_at    timestamptz not null default now()
);

-- Hot lookup: count rows per pubkey within the last 24h to enforce quota.
create index if not exists search_usage_pubkey_created_idx
    on public.search_usage (pubkey, created_at desc);

comment on table public.search_usage is
    'Audit + rate-limit log for /api/v1/search. One row per accepted query.';
