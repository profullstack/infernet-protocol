-- Chat interface — public playground so anyone can exercise the P2P
-- inference network.
--
-- Tokens stream back via an append-only `job_events` table that a Next.js
-- SSE route tails through Supabase Realtime. The chat page writes one
-- row per token (or small batch); the SSE route re-emits to the browser.

create table if not exists public.job_events (
  id         bigserial primary key,
  job_id     uuid not null references public.jobs(id) on delete cascade,
  event_type text not null,       -- 'token' | 'done' | 'error' | 'meta'
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists job_events_job_id_id_idx
  on public.job_events (job_id, id);

create index if not exists job_events_created_at_idx
  on public.job_events (created_at);

-- Useful for the chat provider picker.
create index if not exists providers_status_last_seen_idx
  on public.providers (status, last_seen);

create index if not exists jobs_type_status_idx
  on public.jobs (type, status);

-- Supabase Realtime publication — broadcast job_events inserts so the
-- SSE route can tail them.
alter publication supabase_realtime add table public.job_events;
