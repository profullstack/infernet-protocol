-- Drop the demo seed data that the initial schema migration shipped.
--
-- The initial migration (20260312000000_initial_infernet_schema.sql)
-- inserted placeholder rows so /status had something to render before
-- any real operators existed. Now that real operators are landing, the
-- demo rows actively mislead — the public dashboard appears full of
-- "Provider Atlas" / "Edge-West-01" / "Fine-tune support classifier"
-- jobs that don't represent actual network state.
--
-- This migration removes them by name (the demo rows have unique
-- placeholder names that no real operator would pick), so we don't
-- accidentally nuke any real rows that happened to share a column.
--
-- Idempotent: safe to re-run; missing rows are no-ops.

-- Demo jobs
delete from public.jobs where title in (
  'Fine-tune support classifier',
  'Vision batch for defect detection',
  'Low-latency inference benchmark'
);

-- Demo clients
delete from public.clients where name in (
  'Client Northstar',
  'Client Meridian',
  'Client Vector'
);

-- Demo aggregators
delete from public.aggregators where name in (
  'Aggregator Helios',
  'Aggregator Tide'
);

-- Demo providers
delete from public.providers where name in (
  'Provider Atlas',
  'Provider Boreal',
  'Provider Cinder'
);

-- Demo nodes
delete from public.nodes where name in (
  'Edge-West-01',
  'Edge-East-02',
  'Batch-EU-03'
);

-- Demo models. These three names are squatting unique slots — if a
-- real provider tries to register llama-3.3-70b they'd silently lose
-- to the demo row's older created_at. Drop them so real registrations
-- can take the slot.
delete from public.models where name in (
  'llama-3.3-70b',
  'qwen-2.5-72b',
  'infernet-vision-alpha'
);
