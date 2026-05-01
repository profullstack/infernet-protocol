-- Open-market distributed training (IPIP-0030).
-- A submitter posts a training job; opted-in operators across the
-- whole network claim individual shards, train, and report back.
-- Pays per completed shard via the existing payments rails.
--
-- Distinct from node_commands, which targets a single specific pubkey.
-- training_shards are anonymous slots that any eligible node can claim.

create table if not exists public.training_jobs (
    id                  uuid primary key default gen_random_uuid(),
    submitter_id        uuid references auth.users(id) on delete set null,
    submitter_pubkey    text,                                -- redundant for daemon-side auth scenarios
    name                text,                                -- "svelte5-coder"
    base_model          text not null,                       -- HF id, e.g. "Qwen/Qwen2.5-Coder-7B-Instruct"
    config              jsonb not null,                      -- frozen YAML training config
    dataset_base_url    text not null,                       -- public prefix; shard URL = base + "/shard-N.jsonl"
    upload_base_url     text,                                -- optional: where shards PUT their adapter
    num_shards          int not null check (num_shards > 0 and num_shards <= 256),
    min_vram_gb         int not null default 16,
    price_per_shard_usd numeric(12, 4) not null default 0,
    budget_usd          numeric(12, 4),                      -- total ceiling = num_shards * price_per_shard_usd
    status              text not null default 'open' check (status in ('open','filling','completed','cancelled','expired')),
    created_at          timestamptz not null default now(),
    expires_at          timestamptz,
    completed_at        timestamptz
);

create table if not exists public.training_shards (
    id                  uuid primary key default gen_random_uuid(),
    job_id              uuid not null references public.training_jobs(id) on delete cascade,
    shard_index         int not null,                        -- 0-based
    shard_url           text not null,
    upload_url          text,
    claimed_by_pubkey   text,
    claimed_at          timestamptz,
    started_at          timestamptz,
    completed_at        timestamptz,
    status              text not null default 'pending' check (status in ('pending','claimed','running','completed','failed')),
    adapter_url         text,                                -- final URL where the resulting adapter lives
    metrics             jsonb,                               -- { loss, tokens, duration_ms, ... }
    error               text,
    unique (job_id, shard_index)
);

-- Hot lookup: pending shards (operator's available-jobs poll).
create index if not exists training_shards_pending_idx
    on public.training_shards (status, job_id)
    where status = 'pending';

-- Operator's view of work they've claimed.
create index if not exists training_shards_claimed_idx
    on public.training_shards (claimed_by_pubkey, status)
    where claimed_by_pubkey is not null;

-- Submitter's view of their jobs.
create index if not exists training_jobs_submitter_idx
    on public.training_jobs (submitter_id, created_at desc)
    where submitter_id is not null;

alter table public.training_jobs   enable row level security;
alter table public.training_shards enable row level security;

comment on table public.training_jobs is
    'Open-market distributed training jobs (IPIP-0030). Anyone can post a job with a budget; opted-in operators claim individual shards.';
comment on table public.training_shards is
    'Individual shard work units within a training job. State machine: pending → claimed → running → completed | failed.';
