/**
 * Network defaults + local address helpers for the Infernet CLI.
 *
 * The P2P port is the well-known TCP port where an Infernet node listens
 * for peer connections (not to be confused with the Unix-domain IPC
 * socket, which is local-only). Other nodes in the network reach this
 * node at `ip:P2P_PORT` (v4 or v6).
 */

import os from 'node:os';

export const DEFAULT_P2P_PORT = 46337;

/**
 * Pick a sensible port: config.node.port → env INFERNET_P2P_PORT → default.
 */
export function resolveP2pPort(config) {
    const fromConfig = config?.node?.port;
    if (Number.isFinite(fromConfig) && fromConfig > 0) return fromConfig;

    const fromEnv = Number.parseInt(process.env.INFERNET_P2P_PORT ?? '', 10);
    if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;

    return DEFAULT_P2P_PORT;
}

/**
 * Return a rough "best" local non-loopback address for advertising to
 * other nodes. Prefers IPv4 for now (most NATs / firewalls); falls back
 * to the first non-link-local IPv6 address. Returns null if nothing
 * sensible is found.
 */
export function detectLocalAddress() {
    const ifaces = os.networkInterfaces();
    let v4 = null;
    let v6 = null;
    for (const name of Object.keys(ifaces)) {
        for (const info of ifaces[name] ?? []) {
            if (info.internal) continue;
            if (info.family === 'IPv4' && !v4) v4 = info.address;
            if (info.family === 'IPv6' && !v6) {
                // Skip link-local (fe80::/10).
                if (info.address.toLowerCase().startsWith('fe80')) continue;
                v6 = info.address;
            }
        }
    }
    return v4 ?? v6 ?? null;
}

/**
 * Format an endpoint string, bracketing IPv6 per RFC 3986:
 *   192.0.2.1:46337       -> "192.0.2.1:46337"
 *   2001:db8::1, port 46337 -> "[2001:db8::1]:46337"
 */
export function formatEndpoint(address, port) {
    if (!address) return `:${port}`;
    if (address.includes(':')) return `[${address}]:${port}`;
    return `${address}:${port}`;
}
