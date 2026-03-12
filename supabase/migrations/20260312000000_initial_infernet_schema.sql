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

insert into public.nodes (name, role, status, location, region, capacity, compute_capacity)
values
  ('Edge-West-01', 'provider', 'available', 'San Francisco', 'us-west-1', '4x A100', 400),
  ('Edge-East-02', 'aggregator', 'available', 'Ashburn', 'us-east-1', '2x H100', 220),
  ('Batch-EU-03', 'provider', 'busy', 'Frankfurt', 'eu-central-1', '8x L40S', 640)
on conflict do nothing;

insert into public.providers (name, status, gpu_model, price, reputation)
values
  ('Provider Atlas', 'available', 'NVIDIA H100', 4.2500, 92),
  ('Provider Boreal', 'busy', 'NVIDIA A100', 2.7500, 88),
  ('Provider Cinder', 'available', 'RTX 4090', 1.2500, 81)
on conflict do nothing;

insert into public.aggregators (name, status, active_jobs)
values
  ('Aggregator Helios', 'available', 3),
  ('Aggregator Tide', 'available', 1)
on conflict do nothing;

insert into public.clients (name, status, budget_usd)
values
  ('Client Northstar', 'active', 2500),
  ('Client Meridian', 'active', 725),
  ('Client Vector', 'paused', 0)
on conflict do nothing;

insert into public.models (name, family, context_length, visibility)
values
  ('llama-3.3-70b', 'llama', 131072, 'public'),
  ('qwen-2.5-72b', 'qwen', 32768, 'public'),
  ('infernet-vision-alpha', 'custom', 16384, 'private')
on conflict do nothing;

insert into public.jobs (title, status, payment_offer, model_name, client_name)
values
  ('Fine-tune support classifier', 'pending', 35.5000, 'llama-3.3-70b', 'Client Northstar'),
  ('Vision batch for defect detection', 'running', 82.0000, 'infernet-vision-alpha', 'Client Meridian'),
  ('Low-latency inference benchmark', 'completed', 12.7500, 'qwen-2.5-72b', 'Client Vector')
on conflict do nothing;
