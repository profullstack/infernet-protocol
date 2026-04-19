/**
 * CLI ↔ daemon IPC over a Unix domain socket at
 * `~/.config/infernet/daemon.sock`. Protocol: newline-delimited JSON.
 *
 *   client → daemon:  {"cmd": "<name>", "payload": <any>}\n
 *   daemon → client:  {"ok": true, "data": <any>}\n
 *                     {"ok": false, "error": "<message>"}\n
 *
 * The daemon writes its socket file on start and removes it on shutdown.
 */

import net from 'node:net';
import fs from 'node:fs';

import { getDaemonSocketPath } from './config.js';

/**
 * Is a daemon listening on the socket?
 * Best-effort: the socket file exists AND a connect succeeds within a small
 * timeout. Returns false on any error.
 */
export function isDaemonAlive(timeoutMs = 500) {
    const p = getDaemonSocketPath();
    if (!fs.existsSync(p)) return Promise.resolve(false);

    return new Promise((resolve) => {
        const sock = net.createConnection(p);
        const timer = setTimeout(() => {
            sock.destroy();
            resolve(false);
        }, timeoutMs);
        sock.once('connect', () => {
            clearTimeout(timer);
            sock.end();
            resolve(true);
        });
        sock.once('error', () => {
            clearTimeout(timer);
            resolve(false);
        });
    });
}

/**
 * Send a single command to the daemon and return its response. Resolves
 * with `{ ok, data?, error? }`. If the daemon isn't reachable, resolves
 * with `{ ok: false, error: 'daemon-unreachable', cause: <detail> }`.
 *
 * @param {string} cmd
 * @param {any} [payload]
 * @param {{ timeoutMs?: number }} [opts]
 */
export function sendToDaemon(cmd, payload, { timeoutMs = 3000 } = {}) {
    const p = getDaemonSocketPath();
    return new Promise((resolve) => {
        if (!fs.existsSync(p)) {
            resolve({ ok: false, error: 'daemon-unreachable', cause: 'socket missing' });
            return;
        }
        const sock = net.createConnection(p);
        let buf = '';
        let settled = false;

        const done = (result) => {
            if (settled) return;
            settled = true;
            try { sock.destroy(); } catch { /* ignore */ }
            resolve(result);
        };

        const timer = setTimeout(() => {
            done({ ok: false, error: 'daemon-timeout' });
        }, timeoutMs);

        sock.setEncoding('utf8');

        sock.once('connect', () => {
            try {
                sock.write(JSON.stringify({ cmd, payload }) + '\n');
            } catch (err) {
                clearTimeout(timer);
                done({ ok: false, error: 'write-failed', cause: err?.message ?? String(err) });
            }
        });

        sock.on('data', (chunk) => {
            buf += chunk;
            const nl = buf.indexOf('\n');
            if (nl < 0) return;
            const line = buf.slice(0, nl);
            clearTimeout(timer);
            let parsed;
            try {
                parsed = JSON.parse(line);
            } catch (err) {
                done({ ok: false, error: 'bad-response', cause: err?.message ?? String(err) });
                return;
            }
            done(parsed);
        });

        sock.once('error', (err) => {
            clearTimeout(timer);
            done({ ok: false, error: 'daemon-unreachable', cause: err?.message ?? String(err) });
        });

        sock.once('close', () => {
            clearTimeout(timer);
            if (!settled) {
                done({ ok: false, error: 'connection-closed' });
            }
        });
    });
}
