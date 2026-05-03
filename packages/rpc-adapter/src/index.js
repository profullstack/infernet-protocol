/**
 * @infernetprotocol/rpc-adapter — llama.cpp RPC adapter.
 *
 * IPIP-0033 Phase 2: spawn `llama-server` with an --rpc peer list,
 * parse its stderr for layer assignments, and stream tokens back to
 * the daemon's HTTP layer in the same shape every other Infernet
 * adapter uses.
 */
export { MIN_RPC_PEERS, MAX_RPC_PEERS, RPC_PEER_FRESHNESS_MS, ENGINE_ID } from './constants.js';
export { parseLlamaStderrLine, aggregateLayerAssignments } from './stderr-parser.js';
export { spawnLlamaServer } from './spawn.js';
export { streamChatCompletion } from './stream.js';
