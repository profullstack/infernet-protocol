-- Realtime publication — broadcast inserts/updates on providers and
-- jobs so dashboard / status surfaces can refresh in place instead of
-- polling. job_events is already published (see chat_interface
-- migration); this extends the same channel to the two tables the
-- top-level dashboards actually read.

alter publication supabase_realtime add table public.providers;
alter publication supabase_realtime add table public.jobs;
