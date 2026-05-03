-- IPIP-0026 Phase 2 — provider trust tiers.
--
-- Tiers (from least to most trusted):
--   public    — unknown operator (default)
--   verified  — platform-issued (KYC-lite or CPR credential)
--   trusted   — user-marked
--   private   — provider-set, only allowlisted clients
--
-- Tier is set out-of-band today (verified/trusted are operator-issued,
-- private is provider-controlled). The chat router consumes this column
-- when a job sets `min_trust_tier`.

alter table public.providers
    add column if not exists trust_tier text not null default 'public'
        check (trust_tier in ('public','verified','trusted','private'));

create index if not exists providers_trust_tier_idx
    on public.providers (trust_tier);

comment on column public.providers.trust_tier is
    'IPIP-0026 §2.1 — provider trust tier. Used by /api/chat min_trust_tier filtering.';
