/**
 * Config helpers for the infernet CLI.
 *
 * Config lives at ~/.config/infernet/config.json with mode 0600.
 * Shape:
 *   {
 *     "supabase": { "url": "...", "serviceRoleKey": "...", "schema": "public" },
 *     "node": {
 *       "id": "...",         // Supabase uuid, set after first register
 *       "nodeId": "...",     // Human-readable slug e.g. provider-abc123
 *       "role": "provider",  // provider | aggregator | client
 *       "name": "...",
 *       "publicKey": "...",  // Nostr pubkey hex
 *       "privateKey": "..."  // Nostr privkey hex (locally generated if absent)
 *     }
 *   }
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
 * Load the CLI config. Returns null if the file does not exist.
 * @returns {Promise<Object|null>}
 */
export async function loadConfig() {
    const p = getConfigPath();
    try {
        const raw = await fs.readFile(p, 'utf8');
        return JSON.parse(raw);
    } catch (err) {
        if (err && err.code === 'ENOENT') return null;
        throw err;
    }
}

/**
 * Persist the CLI config. Ensures the config dir exists and chmods 0600.
 * @param {Object} config
 */
export async function saveConfig(config) {
    const dir = getConfigDir();
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    const p = getConfigPath();
    const json = JSON.stringify(config, null, 2) + '\n';
    await fs.writeFile(p, json, { mode: 0o600 });
    try {
        await fs.chmod(p, 0o600);
    } catch {
        // best-effort; ignore on filesystems that don't honor chmod
    }
    return p;
}

/**
 * Load the config, throwing a helpful error if missing.
 * @returns {Promise<Object>}
 */
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
