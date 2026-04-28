create extension if not exists pgcrypto;

create table if not exists public.nodes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null,
  status text not null default 'available',
  location text,
  region text,
  capacity text,
  compute_capacity integer,
  created_at timestamptz not null default now()
);

create table if not exists public.providers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'available',
  gpu_model text,
  price numeric(12, 4) not null default 0,
  reputation integer not null default 50,
  created_at timestamptz not null default now()
);

create table if not exists public.aggregators (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'available',
  active_jobs integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active',
  budget_usd numeric(12, 4) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.models (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  family text,
  context_length integer,
  visibility text not null default 'private',
  created_at timestamptz not null default now()
);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  status text not null default 'pending',
  payment_offer numeric(12, 4) not null default 0,
  model_name text,
  client_name text,
  created_at timestamptz not null default now()
);

create index if not exists nodes_status_idx on public.nodes (status);
create index if not exists providers_status_idx on public.providers (status);
create index if not exists aggregators_status_idx on public.aggregators (status);
create index if not exists clients_status_idx on public.clients (status);
create index if not exists jobs_status_idx on public.jobs (status);

-- No seed data. Tables start empty; rows arrive as real operators
-- run `infernet register`, real clients submit jobs, and real models
-- get advertised by providers. Demo rows that used to live here were
-- removed (and dropped from prod) by 20260428000000_drop_demo_seeds.sql.
