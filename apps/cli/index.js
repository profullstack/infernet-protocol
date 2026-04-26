#!/usr/bin/env node
/**
 * `infernet` — GPU-node CLI / daemon for the Infernet Protocol.
 *
 * This is NOT Next.js code. It is a standalone Node.js ESM binary intended
 * to ship with (or alongside) the control-plane app; GPU operators install
 * it on each rented/owned server to register the node, heartbeat, accept
 * jobs, and report earnings.
 *
 * Nodes authenticate to the control plane using Nostr-signed HTTP requests.
 * No database credentials are stored on the node — the signing keypair IS
 * the credential.
 */

import { loadConfig, getConfigPath } from './lib/config.js';
import { createNodeClientFromConfig } from './lib/node-client.js';

import help, { USAGE } from './commands/help.js';
import init from './commands/init.js';
import login from './commands/login.js';
import register from './commands/register.js';
import update from './commands/update.js';
import remove from './commands/remove.js';
import start from './commands/start.js';
import status from './commands/status.js';
import stop from './commands/stop.js';
import stats from './commands/stats.js';
import logs from './commands/logs.js';
import payout from './commands/payout.js';
import payments from './commands/payments.js';
import gpu from './commands/gpu.js';
import firewall from './commands/firewall.js';
import chat from './commands/chat.js';

function parseArgs(argv) {
    const positional = [];
    const flags = new Map();

    for (let i = 0; i < argv.length; i += 1) {
        const tok = argv[i];
        if (tok === '--') {
            positional.push(...argv.slice(i + 1));
            break;
        }
        if (tok.startsWith('--')) {
            const body = tok.slice(2);
            const eq = body.indexOf('=');
            if (eq >= 0) {
                flags.set(body.slice(0, eq), body.slice(eq + 1));
            } else {
                const next = argv[i + 1];
                if (next !== undefined && !next.startsWith('-')) {
                    flags.set(body, next);
                    i += 1;
                } else {
                    flags.set(body, true);
                }
            }
        } else if (tok.startsWith('-') && tok.length > 1) {
            const body = tok.slice(1);
            if (body === 'h') {
                flags.set('help', true);
                flags.set('h', true);
            } else {
                flags.set(body, true);
            }
        } else {
            positional.push(tok);
        }
    }

    return {
        positional,
        flags,
        has(name) { return flags.has(name); },
        get(name) {
            const v = flags.get(name);
            if (v === undefined) return undefined;
            return v === true ? undefined : v;
        }
    };
}

const COMMANDS = {
    init, login, register, update, remove,
    start, status, stop, stats, logs,
    payout, payments, gpu, firewall, chat, help
};

// Commands that can run without a loaded config.
const NO_CONFIG = new Set(['init', 'login', 'help', 'stats', 'logs', 'stop', 'gpu', 'firewall', 'chat']);
// Commands that need a config but not a control-plane client (none today
// — kept as a future escape hatch).
const NO_CLIENT = new Set();

async function main() {
    const argv = process.argv.slice(2);
    const sub = argv[0];
    const rest = argv.slice(1);

    if (!sub || sub === 'help' || sub === '--help' || sub === '-h') {
        await help();
        process.exit(sub ? 0 : 1);
    }

    const handler = COMMANDS[sub];
    if (!handler) {
        process.stderr.write(`Unknown command: ${sub}\n\n`);
        process.stderr.write(USAGE);
        process.exit(1);
    }

    const args = parseArgs(rest);

    let ctx = { config: null, client: null, configPath: getConfigPath() };

    const helpRequested = args.has('help') || args.has('h');

    if (!NO_CONFIG.has(sub) && !helpRequested) {
        const config = await loadConfig();
        if (!config) {
            process.stderr.write(
                `No infernet config found at ${getConfigPath()}. Run \`infernet init\` first.\n`
            );
            process.exit(1);
        }
        let client = null;
        if (!NO_CLIENT.has(sub)) {
            try {
                client = createNodeClientFromConfig(config);
            } catch (err) {
                process.stderr.write(`${err.message}\n`);
                process.exit(1);
            }
        }
        ctx = { config, client, configPath: getConfigPath() };
    }

    try {
        const code = await handler(args, ctx);
        process.exit(typeof code === 'number' ? code : 0);
    } catch (err) {
        process.stderr.write(`Error: ${err?.message ?? err}\n`);
        if (process.env.INFERNET_DEBUG) {
            process.stderr.write(String(err?.stack ?? '') + '\n');
        }
        process.exit(1);
    }
}

main().catch((err) => {
    process.stderr.write(`Fatal: ${err?.message ?? err}\n`);
    if (process.env.INFERNET_DEBUG) {
        process.stderr.write(String(err?.stack ?? '') + '\n');
    }
    process.exit(1);
});
