-- Per-command progress reporting. The daemon posts updates as Ollama's
-- /api/pull stream advances; the web UI renders a progress bar from this.
--
-- Shape: { status: string, total: bigint, completed: bigint, pct: number }
-- e.g.  { status: "downloading", total: 4400000000, completed: 800000000, pct: 18 }

alter table public.node_commands
    add column if not exists progress jsonb;

comment on column public.node_commands.progress is
    'Streaming progress updates posted by the daemon during long-running operations (e.g. ollama pull). Shape: { status, total, completed, pct }. Always reflects the latest update; not a history.';
