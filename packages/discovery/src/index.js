/**
 * @infernetprotocol/discovery — Hyperswarm DHT discovery + signed
 * handshake (IPIP-0032).
 */
export { topicKey, topicKeyHex, canonicalizeValue } from './topic.js';
export { buildHandshake, verifyHandshake, canonicalJson } from './handshake.js';
export { createDiscoveryNode, readHandshakeFrame } from './node.js';
