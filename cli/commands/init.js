/**
 * `infernet init`
 *
 * Creates the CLI config at ~/.config/infernet/config.json.
 *
 * Supported flags:
 *   --supabase-url <url>
 *   --supabase-key <service-role-key>
 *   --schema <schema>            (default: public)
 *   --role provider|aggregator|client
 *   --name <human-name>
 *   --nostr-pubkey <hex64>
 *   --nostr-privkey <hex64>      (optional; otherwise generated)
 *   --force                      (overwrite existing config)
 *   --help
 *
 * Config file shape:
 *   {
 *     "supabase": { "url": "...", "serviceRoleKey": "...", "schema": "public" },
 *     "node": {
 *       "id": null,
 *       "nodeId": "provider-abc123",
 *       "role": "provider",
 *       "name": "...",
 *       "publicKey": "...",
 *       "privateKey": "..."
 *     }
 *   }
 */

import crypto from 'node:crypto';
import os from 'node:os';

import { getConfigPath, loadConfig, saveConfig } from '../lib/config.js';
import { question } from '../lib/prompt.js';
import { generateNostrKeyPair, isHex64 } from '../lib/identity.js';
import { DEFAULT_P2P_PORT, detectLocalAddress } from '../lib/network.js';
import { printFirewallHint } from '../lib/firewall.js';
import { detectGpus, formatGpuLine } from '../../src/gpu/detect.js';

const HELP = `infernet init — configure this node

Usage:
  infernet init [flags]

Flags:
  --supabase-url <url>           Supabase project URL
  --supabase-key <key>           Supabase service-role key
  --schema <name>                Supabase schema (default: public)
  --role <provider|aggregator|client>
  --name <human-name>
  --nostr-pubkey <hex64>         Nostr public key (hex, 64 chars)
  --nostr-privkey <hex64>        Nostr private key (hex, 64 chars); generated if omitted
  --p2p-port <n>                 TCP port for peer connections (default ${DEFAULT_P2P_PORT})
  --address <host>               Address to advertise to peers (auto-detected if omitted)
  --skip-firewall-hint           Don't print firewall instructions
  --force                        Overwrite an existing config
  --help                         Show this help
`;

const VALID_ROLES = new Set(['provider', 'aggregator', 'client']);

function makeNodeId(role) {
    const slug = crypto.randomBytes(4).toString('hex');
    return `${role}-${slug}`;
}

export default async function init(args) {
    if (args.has('help') || args.has('h')) {
        process.stdout.write(HELP);
        return 0;
    }

    const existing = await loadConfig();
    if (existing && !args.has('force')) {
        process.stderr.write(
            `Config already exists at ${getConfigPath()}. Re-run with --force to overwrite.\n`
        );
        return 1;
    }

    let supabaseUrl = args.get('supabase-url');
    let supabaseKey = args.get('supabase-key');
    let schema = args.get('schema') ?? 'public';
    let role = args.get('role');
    let name = args.get('name');
    let pubkey = args.get('nostr-pubkey');
    let privkey = args.get('nostr-privkey');
    let portArg = args.get('p2p-port');
    let addressArg = args.get('address');

    if (!supabaseUrl) {
        supabaseUrl = await question('Supabase URL');
    }
    if (!supabaseKey) {
        supabaseKey = await question('Supabase service-role key', { secret: true });
    }
    if (!role) {
        role = (await question('Node role (provider|aggregator|client)', {
            default: 'provider'
        })).toLowerCase();
    } else {
        role = role.toLowerCase();
    }
    if (!VALID_ROLES.has(role)) {
        process.stderr.write(
            `Invalid role "${role}". Must be one of: provider, aggregator, client.\n`
        );
        return 1;
    }

    if (!name) {
        name = await question('Human-readable node name', {
            default: `${role}@${os.hostname()}`
        });
    }

    if (!pubkey) {
        pubkey = await question(
            'Nostr public key (hex64, blank to auto-generate)',
            { default: '' }
        );
    }

    if (pubkey && !isHex64(pubkey)) {
        process.stderr.write('Nostr public key must be 64 hex characters.\n');
        return 1;
    }
    if (privkey && !isHex64(privkey)) {
        process.stderr.write('Nostr private key must be 64 hex characters.\n');
        return 1;
    }

    if (!pubkey || !privkey) {
        const generated = generateNostrKeyPair();
        if (!pubkey) pubkey = generated.publicKey;
        if (!privkey) privkey = generated.privateKey;
    }

    // P2P port — default 46337. Only prompt when neither flag nor env is set.
    let port = Number.parseInt(portArg ?? '', 10);
    if (!Number.isFinite(port) || port <= 0) {
        const answer = await question(`P2P port (default ${DEFAULT_P2P_PORT})`, {
            default: String(DEFAULT_P2P_PORT)
        });
        port = Number.parseInt(answer ?? '', 10) || DEFAULT_P2P_PORT;
    }

    const address = addressArg ?? detectLocalAddress();

    const nodeId = existing?.node?.nodeId ?? makeNodeId(role);
    const id = existing?.node?.id ?? null;

    const config = {
        supabase: {
            url: supabaseUrl,
            serviceRoleKey: supabaseKey,
            schema
        },
        node: {
            id,
            nodeId,
            role,
            name,
            publicKey: pubkey,
            privateKey: privkey,
            address: address ?? null,
            port
        }
    };

    const written = await saveConfig(config);
    process.stdout.write(`Wrote ${written}\n`);
    process.stdout.write(`Node id:   ${nodeId}\n`);
    process.stdout.write(`Role:      ${role}\n`);
    process.stdout.write(`Name:      ${name}\n`);
    process.stdout.write(`Pubkey:    ${pubkey}\n`);
    process.stdout.write(`P2P:       ${address ?? '(address not detected)'}:${port}\n`);

    // GPU detection — purely informational during init; the actual specs
    // are re-scanned on `register` / daemon heartbeat.
    try {
        const gpus = await detectGpus();
        if (gpus.length > 0) {
            process.stdout.write(`GPUs:      ${gpus.length} detected\n`);
            for (const g of gpus) {
                process.stdout.write(`  - ${formatGpuLine(g)}\n`);
            }
        } else {
            process.stdout.write('GPUs:      none detected (CPU-only provider)\n');
        }
    } catch (err) {
        process.stderr.write(`GPU detection failed: ${err?.message ?? err}\n`);
    }

    // Firewall hint: tell the operator how to open the P2P port. This does
    // NOT mutate firewall state — opening the port is their call.
    if (!args.has('skip-firewall-hint') && role !== 'client') {
        process.stdout.write('\n');
        printFirewallHint(port, 'init');
    }

    process.stdout.write('Next:      run `infernet register` to announce this node.\n');
    return 0;
}

export { HELP };
