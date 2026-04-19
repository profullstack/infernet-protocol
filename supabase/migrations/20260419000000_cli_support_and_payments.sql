-- CLI / multi-node / multi-coin payment support.
-- Extends the initial schema so GPU-node CLIs can register, heartbeat,
-- receive jobs, and get paid out in any supported cryptocurrency.

-- =========================================================
-- providers
-- =========================================================
alter table public.providers
  add column if not exists node_id     text unique,
  add column if not exists public_key  text,
  add column if not exists address     text,
  add column if not exists port        integer,
  add column if not exists specs       jsonb not null default '{}'::jsonb,
  add column if not exists last_seen   timestamptz;

create index if not exists providers_node_id_idx    on public.providers (node_id);
create index if not exists providers_public_key_idx on public.providers (public_key);
create index if not exists providers_last_seen_idx  on public.providers (last_seen);

-- =========================================================
-- clients
-- =========================================================
alter table public.clients
  add column if not exists node_id     text unique,
  add column if not exists public_key  text,
  add column if not exists address     text,
  add column if not exists last_seen   timestamptz;

create index if not exists clients_node_id_idx    on public.clients (node_id);
create index if not exists clients_public_key_idx on public.clients (public_key);

-- =========================================================
-- aggregators
-- =========================================================
alter table public.aggregators
  add column if not exists node_id     text unique,
  add column if not exists public_key  text,
  add column if not exists address     text,
  add column if not exists port        integer,
  add column if not exists reputation  integer not null default 50,
  add column if not exists last_seen   timestamptz;

create index if not exists aggregators_node_id_idx    on public.aggregators (node_id);
create index if not exists aggregators_public_key_idx on public.aggregators (public_key);

-- =========================================================
-- jobs — add FK columns, type, timestamps, payment fields
-- =========================================================
alter table public.jobs
  add column if not exists type              text not null default 'inference',
  add column if not exists client_id         uuid references public.clients(id)     on delete set null,
  add column if not exists provider_id       uuid references public.providers(id)   on delete set null,
  add column if not exists aggregator_id     uuid references public.aggregators(id) on delete set null,
  add column if not exists input_spec        jsonb not null default '{}'::jsonb,
  add column if not exists result            jsonb,
  add column if not exists error             text,
  add column if not exists payment_coin      text,
  add column if not exists payment_tx_hash   text,
  add column if not exists payment_status    text not null default 'unpaid',
  add column if not exists payment_invoice   text,
  add column if not exists updated_at        timestamptz not null default now(),
  add column if not exists assigned_at       timestamptz,
  add column if not exists completed_at      timestamptz;

create index if not exists jobs_provider_id_idx      on public.jobs (provider_id);
create index if not exists jobs_aggregator_id_idx    on public.jobs (aggregator_id);
create index if not exists jobs_client_id_idx        on public.jobs (client_id);
create index if not exists jobs_payment_status_idx   on public.jobs (payment_status);

-- =========================================================
-- users — Nostr-authenticated identities
-- =========================================================
create table if not exists public.users (
  id                uuid primary key default gen_random_uuid(),
  nostr_public_key  text not null unique,
  display_name      text,
  email             text,
  created_at        timestamptz not null default now()
);

create index if not exists users_nostr_public_key_idx on public.users (nostr_public_key);

-- =========================================================
-- settings — key/value config store
-- =========================================================
create table if not exists public.settings (
  id         uuid primary key default gen_random_uuid(),
  key        text not null unique,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- =========================================================
-- node_roles — per-node role info for distributed inference
-- =========================================================
create table if not exists public.node_roles (
  id                   uuid primary key default gen_random_uuid(),
  node                 text not null,
  role                 text not null,
  coordinator_address  text,
  available_memory     integer,
  max_batch_size       integer,
  supported_models     jsonb,
  worker_status        text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists node_roles_node_idx on public.node_roles (node);

-- =========================================================
-- distributed_jobs — multi-worker coordination state
-- =========================================================
create table if not exists public.distributed_jobs (
  id            uuid primary key default gen_random_uuid(),
  job_id        uuid references public.jobs(id) on delete cascade,
  coordinator   text,
  strategy      text,
  workers       jsonb not null default '[]'::jsonb,
  status        text not null default 'pending',
  progress      integer not null default 0,
  result        jsonb,
  error         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  completed_at  timestamptz
);

create index if not exists distributed_jobs_job_id_idx on public.distributed_jobs (job_id);

-- =========================================================
-- platform_wallets — canonical Infernet deposit addresses
-- =========================================================
create table if not exists public.platform_wallets (
  id         uuid primary key default gen_random_uuid(),
  coin       text not null,
  network    text,
  address    text not null,
  label      text,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  unique (coin, address)
);

create index if not exists platform_wallets_coin_idx on public.platform_wallets (coin);

insert into public.platform_wallets (coin, network, address, label) values
  ('BTC',   'bitcoin',          '1HvEHWHAYW53cP6aQxWEcNaPb35sZZKFwF',                                     'treasury-1'),
  ('BTC',   'bitcoin',          '17xz382FDrKZj25aFkkc5CZuFpQcbFAgur',                                     'treasury-2'),
  ('BTC',   'bitcoin',          '1GTB6S6UGn9rkrKSTGpcEhpHi8SzXzWx6q',                                     'treasury-3'),
  ('ETH',   'ethereum',         '0xCC3b072391AE7A8d10cF00DdC5F61DB2cA5541E5',                             'treasury-1'),
  ('ETH',   'ethereum',         '0xdDeef601c86C651DD20d6EE3FE4318fC4343D95f',                             'treasury-2'),
  ('SOL',   'solana',           'B3zn7yeoL6NP8JCpis9ikGX8U4uCbrybCu5QeFyqkKpr',                           'treasury-1'),
  ('SOL',   'solana',           '7tKgJsSWPQGKk3wSijwbLf4qL8Tno4GPXrwGvkmiz39g',                           'treasury-2'),
  ('POL',   'polygon',          '0xCC3b072391AE7A8d10cF00DdC5F61DB2cA5541E5',                             'treasury-1'),
  ('BCH',   'bitcoin-cash',     'bitcoincash:qryu0va3022eafyv6dhmdd7kylxszm5myqncfxjkaj',                 'treasury-1'),
  ('BCH',   'bitcoin-cash',     'bitcoincash:qpw9mk5gmalaj9mjnndjkyenjz3rxgtt8grllxcmvd',                 'treasury-2'),
  ('BCH',   'bitcoin-cash',     'bitcoincash:qqppxsqwekrpsn5lk56sjjpvhpv424zetudh8szzx7',                 'treasury-3'),
  ('DOGE',  'dogecoin',         'DPsNhvoJT5h7FGyh9uiWLeFJLsyLh7f3Wf',                                     'treasury-1'),
  ('DOGE',  'dogecoin',         'DSKkQtcPirS2H5kGyc5pU8PHSVqx6DdUyV',                                     'treasury-2'),
  ('XRP',   'ripple',           'r4MoVnbkHbeJGiDx7GyVCCCHyhSPoqXfHR',                                     'treasury-1'),
  ('XRP',   'ripple',           'rsmeBkmDYGPxtYmbad8iBxnikePABUEZJx',                                     'treasury-2'),
  ('XRP',   'ripple',           'rKduygNv5nAP9u7y952Fhs9EPHTzgHguUi',                                     'treasury-3'),
  ('ADA',   'cardano',          'addr1v9j4u56udhkav64gm9qrp48lsymvwu3qm649vq9s0hnmzrqumlavc',             'treasury-1'),
  ('ADA',   'cardano',          'addr1v9euqha76gav45zwne6tu06gdu9mf3c8hqxlnx07km6xfxc4u9pyl',             'treasury-2'),
  ('BNB',   'bsc',              '0xCC3b072391AE7A8d10cF00DdC5F61DB2cA5541E5',                             'treasury-1'),
  ('USDT',  'ethereum',         '0xCC3b072391AE7A8d10cF00DdC5F61DB2cA5541E5',                             'usdt-erc20'),
  ('USDT',  'polygon',          '0xCC3b072391AE7A8d10cF00DdC5F61DB2cA5541E5',                             'usdt-polygon'),
  ('USDT',  'solana',           'B3zn7yeoL6NP8JCpis9ikGX8U4uCbrybCu5QeFyqkKpr',                           'usdt-spl'),
  ('USDC',  'ethereum',         '0xCC3b072391AE7A8d10cF00DdC5F61DB2cA5541E5',                             'usdc-erc20'),
  ('USDC',  'polygon',          '0xCC3b072391AE7A8d10cF00DdC5F61DB2cA5541E5',                             'usdc-polygon'),
  ('USDC',  'solana',           'B3zn7yeoL6NP8JCpis9ikGX8U4uCbrybCu5QeFyqkKpr',                           'usdc-spl'),
  ('USDC',  'base',             '0xCC3b072391AE7A8d10cF00DdC5F61DB2cA5541E5',                             'usdc-base')
on conflict (coin, address) do nothing;

-- =========================================================
-- provider_payouts — where a provider wants their earnings
-- =========================================================
create table if not exists public.provider_payouts (
  id            uuid primary key default gen_random_uuid(),
  provider_id   uuid not null references public.providers(id) on delete cascade,
  coin          text not null,
  network       text,
  address       text not null,
  is_default    boolean not null default false,
  created_at    timestamptz not null default now(),
  unique (provider_id, coin, address)
);

create index if not exists provider_payouts_provider_id_idx on public.provider_payouts (provider_id);

-- =========================================================
-- payment_transactions — audit trail of all inbound / outbound crypto
-- =========================================================
create table if not exists public.payment_transactions (
  id               uuid primary key default gen_random_uuid(),
  direction        text not null,                       -- 'inbound' | 'outbound'
  job_id           uuid references public.jobs(id) on delete set null,
  provider_id      uuid references public.providers(id) on delete set null,
  client_id        uuid references public.clients(id) on delete set null,
  coin             text not null,
  network          text,
  amount           numeric(36, 18) not null,
  amount_usd       numeric(14, 4),
  address          text not null,
  tx_hash          text,
  invoice_id       text,
  status           text not null default 'pending',     -- 'pending' | 'confirmed' | 'failed'
  provider_gateway text,                                -- e.g. 'coinpayportal'
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  confirmed_at     timestamptz
);

create index if not exists payment_transactions_status_idx     on public.payment_transactions (status);
create index if not exists payment_transactions_job_id_idx     on public.payment_transactions (job_id);
create index if not exists payment_transactions_tx_hash_idx    on public.payment_transactions (tx_hash);
create index if not exists payment_transactions_invoice_id_idx on public.payment_transactions (invoice_id);
