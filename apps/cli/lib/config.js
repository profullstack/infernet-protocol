/**
 * Config helpers for the infernet CLI.
 *
 * Config lives at ~/.config/infernet/config.json with mode 0600.
 *
 * Shape (v2 — signed-API era):
 *   {
 *     "controlPlane": { "url": "https://infernetprotocol.com" },
 *     "node": {
 *       "id": "...",         // server-assigned uuid after register
 *       "nodeId": "...",     // human-readable slug e.g. provider-abc123
 *       "role": "provider",  // provider | aggregator | client
 *       "name": "...",
 *       "publicKey":  "...", // Nostr (secp256k1 / BIP-340 x-only) pubkey hex
 *       "privateKey": "...", // Nostr privkey hex — proves ownership on every call
 *       "payoutPublicKey": "...", // optional: separate identity for payouts
 *       "address": "...|null",
 *       "port": 46337
 *     }
 *   }
 *
 * Old configs with `supabase.serviceRoleKey` still load (we ignore the key and
 * migrate `supabase.url` -> `controlPlane.url` transparently).
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export function getConfigDir() {
    const xdg = process.env.XDG_CONFIG_HOME;
    const base = xdg && xdg.length > 0 ? xdg : path.join(os.homedir(), '.config');
    return path.join(base, 'infernet');
}

export function getConfigPath() {
    return path.join(getConfigDir(), 'config.json');
}

export function getDaemonPidPath() {
    return path.join(getConfigDir(), 'daemon.pid');
}

export function getDaemonSocketPath() {
    return path.join(getConfigDir(), 'daemon.sock');
}

export function getDaemonLogPath() {
    return path.join(getConfigDir(), 'daemon.log');
}

/**
 * Normalize legacy (v1, Supabase-keyed) configs to the v2 shape. Never
 * silently keeps a service-role key around.
 */
function migrate(raw) {
    if (!raw || typeof raw !== 'object') return raw;
    const out = { ...raw };
    if (!out.controlPlane || typeof out.controlPlane !== 'object') {
        const legacyUrl = out.supabase?.url;
        if (legacyUrl) out.controlPlane = { url: legacyUrl };
    }
    if (out.supabase) {
        // Drop the service-role key. It's no longer needed on nodes.
        delete out.supabase;
    }
    return out;
}

/**
 * @returns {Promise<Object|null>}
 */
export async function loadConfig() {
    const p = getConfigPath();
    try {
        const raw = await fs.readFile(p, 'utf8');
        const parsed = JSON.parse(raw);
        return migrate(parsed);
    } catch (err) {
        if (err && err.code === 'ENOENT') return null;
        throw err;
    }
}

export async function saveConfig(config) {
    const dir = getConfigDir();
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    const p = getConfigPath();
    const json = JSON.stringify(config, null, 2) + '\n';
    await fs.writeFile(p, json, { mode: 0o600 });
    try { await fs.chmod(p, 0o600); } catch { /* ignore */ }
    return p;
}

export async function requireConfig() {
    const cfg = await loadConfig();
    if (!cfg) {
        const err = new Error(
            `No infernet config found at ${getConfigPath()}. Run \`infernet init\` first.`
        );
        err.code = 'ENOCONFIG';
        throw err;
    }
    return cfg;
}

export function getControlPlaneUrl(config) {
    const url = config?.controlPlane?.url;
    if (!url) {
        throw new Error(
            'config.controlPlane.url is not set. Run `infernet login --url <https://...>` to point this node at a control plane.'
        );
    }
    return url;
}
