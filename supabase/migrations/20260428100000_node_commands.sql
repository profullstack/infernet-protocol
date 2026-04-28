-- Remote node-management commands queued by an owner from the
-- dashboard, picked up by the target daemon's poll loop, executed,
-- and reported back. Same outbound-poll mechanism as jobs — no
-- inbound connectivity required, works through any NAT/firewall.
--
-- Owner enforcement happens server-side at write time: the create
-- endpoint checks pubkey_links(user_id, pubkey) before inserting.
-- A daemon polling its own pubkey can only see commands targeting
-- itself (signed-request auth establishes the pubkey).

create table if not exists public.node_commands (
    id           uuid primary key default gen_random_uuid(),
    pubkey       text not null,                            -- target node's Nostr pubkey
    command      text not null,                            -- 'model_install' | 'model_remove' | future kinds
    args         jsonb not null default '{}'::jsonb,       -- e.g. { model: "qwen2.5:7b" }
    status       text not null default 'pending',          -- pending | running | completed | failed
    issued_by    uuid references auth.users(id) on delete set null,
    result       jsonb,                                    -- daemon-reported on success
    error        text,                                     -- daemon-reported on failure
    issued_at    timestamptz not null default now(),
    started_at   timestamptz,
    completed_at timestamptz
);

-- Hot lookup: pending commands for a given pubkey (the daemon's poll).
create index if not exists node_commands_pending_idx
    on public.node_commands (pubkey, status)
    where status in ('pending', 'running');

-- Audit lookup: commands a user issued.
create index if not exists node_commands_issued_by_idx
    on public.node_commands (issued_by, issued_at desc);

-- RLS: service-role-only (every read goes through a server route
-- that re-checks ownership). Same posture as pubkey_links.
alter table public.node_commands enable row level security;

comment on table public.node_commands is
    'Owner-issued remote management commands for provider nodes. Daemons poll their own pubkey via /api/v1/node/commands/poll; owners write via /api/v1/user/nodes/<pubkey>/commands.';
comment on column public.node_commands.command is
    'Subcommand verb. Initial set: model_install (ollama pull), model_remove (ollama rm). Add new verbs by extending the daemon dispatcher in apps/cli/commands/start.js.';
