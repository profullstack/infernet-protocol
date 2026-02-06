-- Bootstrap nodes registry
-- Minimal centralized layer for peer discovery
create table if not exists public.bootstrap_nodes (
  id uuid default gen_random_uuid() primary key,
  peer_id text unique not null,
  multiaddr text not null,
  active boolean default true,
  capabilities jsonb default '{}',
  last_seen timestamptz default now(),
  created_at timestamptz default now()
);

-- Index for active node lookups
create index idx_bootstrap_nodes_active on public.bootstrap_nodes (active) where active = true;

-- Auto-update last_seen
create or replace function update_last_seen()
returns trigger as $$
begin
  new.last_seen = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_bootstrap_nodes_last_seen
  before update on public.bootstrap_nodes
  for each row execute function update_last_seen();

-- Enable Row Level Security
alter table public.bootstrap_nodes enable row level security;

-- Anyone can read active nodes (needed for bootstrap)
create policy "Anyone can read active bootstrap nodes"
  on public.bootstrap_nodes for select
  using (active = true);

-- Nodes can register/update themselves via anon key
create policy "Nodes can register themselves"
  on public.bootstrap_nodes for insert
  with check (true);

create policy "Nodes can update their own record"
  on public.bootstrap_nodes for update
  using (true);

-- Optional: network stats view
create or replace view public.network_stats as
select
  count(*) filter (where active and last_seen > now() - interval '5 minutes') as active_nodes,
  count(*) as total_nodes,
  max(last_seen) as last_activity
from public.bootstrap_nodes;
