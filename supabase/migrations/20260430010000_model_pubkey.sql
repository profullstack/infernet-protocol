-- IPIP-0028: model-keyed E2E encryption.
--
-- Stores the model's x-only secp256k1 pubkey when the consumer encrypted
-- to a specific model key rather than the node key. Null for node-keyed
-- (IPIP-0027) or legacy unencrypted jobs.

alter table jobs
    add column if not exists model_pubkey text;

comment on column jobs.model_pubkey is
    'Model x-only secp256k1 pubkey (NIP-44 / BIP-340, 64 hex chars). '
    'Set when the job uses model-keyed E2E encryption (IPIP-0028). Null for node-keyed or legacy jobs.';
