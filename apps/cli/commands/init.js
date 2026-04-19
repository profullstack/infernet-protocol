/**
 * `infernet init`
 *
 * Creates the CLI config at ~/.config/infernet/config.json. The node talks
 * to the control plane through signed HTTP requests (Nostr / BIP-340) — no
 * database credentials are stored locally, so init only needs the control
 * plane URL plus a Nostr keypair (generated if the operator doesn't bring one).
 *
 * Supported flags:
 *   --url <url>                    Control-plane base URL (default: https://infernet.tech)
 *   --role provider|aggregator|client
 *   --name <human-name>
 *   --nostr-pubkey <hex64>
 *   --nostr-privkey <hex64>        (optional; otherwise generated)
 *   --p2p-port <n>                 TCP port for peer connections
 *   --address <host>               Address to advertise (blank = don't advertise)
 *   --no-advertise                 Don't advertise an address or port at all
 *   --force                        Overwrite existing config
 *   --help
 */

import crypto from 'node:crypto';
import os from 'node:os';

import { getConfigPath, loadConfig, saveConfig } from '../lib/config.js';
import { question } from '../lib/prompt.js';
import {
    generateNostrKeyPair,
    derivePublicKey,
    keyPairIsValid,
    isHex64
} from '../lib/identity.js';
import { DEFAULT_P2P_PORT, detectLocalAddress } from '../lib/network.js';
import { printFirewallHint } from '../lib/firewall.js';
import { detectGpus, formatGpuLine } from '@infernetprotocol/gpu';

const DEFAULT_CONTROL_PLANE = 'https://infernet.tech';

const HELP = `infernet init — configure this node

Usage:
  infernet init [flags]

Flags:
  --url <url>                    Control-plane base URL (default: ${DEFAULT_CONTROL_PLANE})
  --role <provider|aggregator|client>
  --name <human-name>
  --nostr-pubkey <hex64>         Nostr public key (hex, 64 chars)
  --nostr-privkey <hex64>        Nostr private key (hex, 64 chars); generated if omitted
  --p2p-port <n>                 TCP port for peer connections (default ${DEFAULT_P2P_PORT})
  --address <host>               Address to advertise to peers (auto-detected if omitted)
  --no-advertise                 Don't advertise an address or port at all
  --skip-firewall-hint           Don't print firewall instructions
  --force                        Overwrite an existing config
  --help                         Show this help

Nodes authenticate to the control plane with Nostr-signed requests. No
database credentials are stored in this config.
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

    let url = args.get('url');
    let role = args.get('role');
    let name = args.get('name');
    let pubkey = args.get('nostr-pubkey');
    let privkey = args.get('nostr-privkey');
    let portArg = args.get('p2p-port');
    let addressArg = args.get('address');
    const noAdvertise = args.has('no-advertise');

    if (!url) {
        url = await question('Control-plane URL', { default: DEFAULT_CONTROL_PLANE });
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

    if (privkey && !isHex64(privkey)) {
        process.stderr.write('Nostr private key must be 64 hex characters.\n');
        return 1;
    }
    if (pubkey && !isHex64(pubkey)) {
        process.stderr.write('Nostr public key must be 64 hex characters.\n');
        return 1;
    }

    if (privkey && !pubkey) {
        pubkey = derivePublicKey(privkey);
    } else if (!privkey) {
        const generated = generateNostrKeyPair();
        privkey = generated.privateKey;
        pubkey = generated.publicKey;
    }

    if (!keyPairIsValid(pubkey, privkey)) {
        process.stderr.write('Nostr pubkey does not match privkey (failed BIP-340 derivation check).\n');
        return 1;
    }

    // P2P port — default 46337. Only prompt when neither flag nor env is set.
    let port = Number.parseInt(portArg ?? '', 10);
    if (!Number.isFinite(port) || port <= 0) port = DEFAULT_P2P_PORT;

    const address = noAdvertise ? null : (addressArg ?? detectLocalAddress());

    const nodeId = existing?.node?.nodeId ?? makeNodeId(role);
    const id = existing?.node?.id ?? null;

    const config = {
        controlPlane: { url },
        node: {
            id,
            nodeId,
            role,
            name,
            publicKey: pubkey,
            privateKey: privkey,
            address: noAdvertise ? null : (address ?? null),
            port: noAdvertise ? null : port
        }
    };

    const written = await saveConfig(config);
    process.stdout.write(`Wrote ${written}\n`);
    process.stdout.write(`Control plane: ${url}\n`);
    process.stdout.write(`Node id:       ${nodeId}\n`);
    process.stdout.write(`Role:          ${role}\n`);
    process.stdout.write(`Name:          ${name}\n`);
    process.stdout.write(`Pubkey:        ${pubkey}\n`);
    if (noAdvertise) {
        process.stdout.write(`P2P:           disabled (outbound-only)\n`);
    } else {
        process.stdout.write(`P2P:           ${address ?? '(address not detected)'}:${port}\n`);
    }

    // GPU detection — purely informational during init; the actual coarse
    // capability is re-gathered on `register` and heartbeat.
    try {
        const gpus = await detectGpus();
        if (gpus.length > 0) {
            process.stdout.write(`GPUs:          ${gpus.length} detected\n`);
            for (const g of gpus) {
                process.stdout.write(`  - ${formatGpuLine(g)}\n`);
            }
        } else {
            process.stdout.write('GPUs:          none detected (CPU-only provider)\n');
        }
    } catch (err) {
        process.stderr.write(`GPU detection failed: ${err?.message ?? err}\n`);
    }

    if (!args.has('skip-firewall-hint') && role !== 'client' && !noAdvertise) {
        process.stdout.write('\n');
        printFirewallHint(port, 'init');
    }

    process.stdout.write('Next:          run `infernet register` to announce this node.\n');
    return 0;
}

export { HELP };
