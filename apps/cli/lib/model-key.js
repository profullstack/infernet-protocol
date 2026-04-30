/**
 * Per-model secp256k1 keypair management (IPIP-0028 Phase 1).
 *
 * Each model served by a node gets its own keypair stored under
 * config.engine.model_keys[modelName]. Consumers can encrypt
 * to the model's pubkey rather than the node's pubkey, limiting
 * blast radius to a single model if a key is ever compromised.
 *
 * Keys are generated lazily on first use and persisted to config.
 */

import { generateKeyPair } from '@infernetprotocol/auth';
import { loadConfig, saveConfig } from './config.js';

/** Get or generate a keypair for `modelName`. Persists in config. */
export async function getOrCreateModelKey(modelName) {
    if (!modelName || typeof modelName !== 'string') return null;
    const config = (await loadConfig()) ?? {};
    const existing = config.engine?.model_keys?.[modelName];
    if (existing?.publicKey && existing?.privateKey) return existing;
    const keypair = generateKeyPair();
    const updated = {
        ...config,
        engine: {
            ...(config.engine ?? {}),
            model_keys: {
                ...(config.engine?.model_keys ?? {}),
                [modelName]: keypair
            }
        }
    };
    await saveConfig(updated);
    return keypair;
}

/** Return `{ modelName: publicKey }` for all models that have keys. */
export async function getModelPublicKeys() {
    const config = (await loadConfig()) ?? {};
    const modelKeys = config.engine?.model_keys ?? {};
    const out = {};
    for (const [name, kp] of Object.entries(modelKeys)) {
        if (kp?.publicKey) out[name] = kp.publicKey;
    }
    return out;
}

/** Return the full `{ publicKey, privateKey }` for `modelName`, or null. */
export async function getModelKeyPair(modelName) {
    if (!modelName) return null;
    const config = (await loadConfig()) ?? {};
    return config.engine?.model_keys?.[modelName] ?? null;
}
