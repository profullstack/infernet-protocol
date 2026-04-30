-- IPIP-0027: End-to-end NIP-44 encryption between consumer and provider.
--
-- Stores the consumer's x-only secp256k1 pubkey (64 hex chars) so the
-- provider daemon can derive the shared secret for decryption.
-- This column is not sensitive — it is a public key by definition.

alter table jobs
    add column if not exists client_pubkey text;

comment on column jobs.client_pubkey is
    'Consumer x-only secp256k1 pubkey (NIP-44 / BIP-340, 64 hex chars). '
    'Set when the job uses E2E encryption (IPIP-0027). Null for legacy jobs.';
