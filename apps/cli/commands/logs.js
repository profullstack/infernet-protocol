/**
 * `infernet logs` — print (or tail) the daemon log file at
 * `~/.config/infernet/daemon.log`.
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import readline from 'node:readline';

import { getDaemonLogPath } from '../lib/config.js';

const HELP = `infernet logs — show the daemon log

Usage:
  infernet logs [flags]

Flags:
  -f, --follow       Tail the log file (Ctrl-C to exit)
  --lines <n>        Print the last N lines (default 200)
  --help             Show this help

Log path: ~/.config/infernet/daemon.log
`;

async function tailLines(path, n) {
    const stream = fs.createReadStream(path, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    const buf = [];
    for await (const line of rl) {
        buf.push(line);
        if (buf.length > n) buf.shift();
    }
    return buf;
}

export default async function logs(args) {
    if (args.has('help') || args.has('h')) {
        process.stdout.write(HELP);
        return 0;
    }

    const logPath = getDaemonLogPath();
    try { await fsp.access(logPath); }
    catch {
        process.stderr.write(`No daemon log yet at ${logPath}. Run \`infernet start\` first.\n`);
        return 1;
    }

    const n = Number.parseInt(args.get('lines') ?? '200', 10) || 200;
    const follow = args.has('follow') || args.has('f');

    const lines = await tailLines(logPath, n);
    for (const line of lines) process.stdout.write(line + '\n');

    if (!follow) return 0;

    // Follow mode: watch the file for appended data.
    let lastSize = (await fsp.stat(logPath)).size;
    return new Promise((resolve) => {
        const watcher = fs.watch(logPath, { persistent: true }, async () => {
            try {
                const st = await fsp.stat(logPath);
                if (st.size > lastSize) {
                    const fd = await fsp.open(logPath, 'r');
                    const length = st.size - lastSize;
                    const buf = Buffer.alloc(length);
                    await fd.read(buf, 0, length, lastSize);
                    await fd.close();
                    process.stdout.write(buf.toString('utf8'));
                    lastSize = st.size;
                } else if (st.size < lastSize) {
                    // File was truncated or rotated.
                    lastSize = 0;
                }
            } catch {
                // ignore transient errors
            }
        });
        const cleanup = () => {
            try { watcher.close(); } catch { /* ignore */ }
            resolve(0);
        };
        process.on('SIGINT', cleanup);
        process.on('SIGTERM', cleanup);
    });
}

export { HELP };
