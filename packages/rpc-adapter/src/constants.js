/**
 * IPIP-0033 §3 — control-plane policy knobs. The control plane refuses
 * a `distributed: true` request when fewer than MIN_RPC_PEERS slices
 * are available. MAX_RPC_PEERS caps the --rpc list length the primary
 * is handed.
 *
 * Both are starting values. The IPIP §Open-questions calls out that
 * MAX_RPC_PEERS=8 is a guess pending real measurement.
 */
export const MIN_RPC_PEERS = 2;
export const MAX_RPC_PEERS = 8;

/** §4 — drop a peer the daemon hasn't seen handshake for in this long. */
export const RPC_PEER_FRESHNESS_MS = 5 * 60 * 1000;

/** Backend identity surfaced on every routing event (§5). */
export const ENGINE_ID = 'llama.cpp';
