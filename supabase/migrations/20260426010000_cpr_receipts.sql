-- IPIP-0007 phase 2 — local queue for CPR receipts.
--
-- When a job completes, the control plane builds a Receipt and tries
-- to POST it to coinpayportal.com/api/cpr/receipts. CPR being
-- unreachable MUST NOT block the job — receipts queue here and a
-- worker (phase 3) drains them with exponential back-off.

create table if not exists public.cpr_receipts_queue (
  id            uuid primary key default gen_random_uuid(),
  receipt_id    uuid not null unique,
  job_id        uuid references public.jobs(id) on delete set null,
  payload       jsonb not null,
  status        text not null default 'pending'
                check (status in ('pending', 'sent', 'failed', 'permanent_fail')),
  attempts      integer not null default 0,
  last_error    text,
  next_attempt_at timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  sent_at       timestamptz
);

create index if not exists cpr_receipts_queue_status_idx
  on public.cpr_receipts_queue (status, next_attempt_at);

create index if not exists cpr_receipts_queue_job_idx
  on public.cpr_receipts_queue (job_id);

comment on table public.cpr_receipts_queue is
  'IPIP-0007 phase 2: durable queue of CPR Receipts pending submission to CoinPayPortal. Worker drains pending rows with retry/back-off.';

-- RLS: service-role only. No client-side reads or writes.
alter table public.cpr_receipts_queue enable row level security;
