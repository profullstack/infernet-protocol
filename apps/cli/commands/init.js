/**
 * `infernet init`
 *
 * Creates the CLI config at ~/.config/infernet/config.json. The node talks
 * to the control plane through signed HTTP requests (Nostr / BIP-340) — no
 * database credentials are stored locally, so init only needs the control
 * plane URL plus a Nostr keypair (generated if the operator doesn't bring one).
 *
 * Supported flags:
 *   --url <url>                    Control-plane base URL (default: https://infernetprotocol.com)
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
import {
    applyFirewallRule,
    describeFirewallHowTo,
    detectFirewall,
    printFirewallHint
} from '../lib/firewall.js';
import { detectGpus, formatGpuLine } from '@infernetprotocol/gpu';

const DEFAULT_CONTROL_PLANE = 'https://infernetprotocol.com';

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
    const yes = args.has('yes');
    const force = args.has('force');
    // A config is "complete" once it has both a Nostr keypair AND a
    // control-plane URL.
    //
    // Behavior on re-run:
    //   --force         → wipe + regenerate identity (last resort)
    //   --yes           → upgrade in place: preserve keys + url + role,
    //                     regenerate name if it matches a stale auto-
    //                     generated pattern (so install.sh re-runs
    //                     refresh the display name without losing keys)
    //   neither, complete → bail and ask for --force
    //   neither, partial  → fill in the gaps
    const hasKey = !!(existing?.node?.publicKey && existing?.node?.privateKey);
    const hasUrl = !!existing?.controlPlane?.url;
    const upgradeInPlace = existing && hasKey && hasUrl && yes && !force;

    if (existing && hasKey && hasUrl && !force && !yes) {
        process.stderr.write(
            `Config already exists at ${getConfigPath()}. Re-run with --force to overwrite, or --yes to upgrade in place.\n`
        );
        return 1;
    }
    if (existing && !force && !upgradeInPlace) {
        process.stdout.write(
            `Found partial config at ${getConfigPath()} — finishing initialization.\n`
        );
    }
    if (upgradeInPlace) {
        process.stdout.write(
            `Upgrading existing config in place at ${getConfigPath()} (keys preserved).\n`
        );
    }

    let url = args.get('url') ?? (upgradeInPlace ? existing.controlPlane.url : undefined);
    let role = args.get('role') ?? (upgradeInPlace ? existing.node.role : undefined);
    let name = args.get('name');
    let pubkey = args.get('nostr-pubkey') ?? (upgradeInPlace ? existing.node.publicKey : undefined);
    let privkey = args.get('nostr-privkey') ?? (upgradeInPlace ? existing.node.privateKey : undefined);
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

    // Generate nodeId BEFORE defaulting the name so we can append its
    // hash slug to the name (gives "user@host:0f44326c"-style identifiers
    // that are both human-readable and unique across multiple nodes
    // running on the same box).
    const nodeId = existing?.node?.nodeId ?? makeNodeId(role);
    const id = existing?.node?.id ?? null;

    // Compute the default before the existing-name check so we can
    // also use it for stale-name detection.
    const userPart = process.env.USER ?? (() => {
        try { return os.userInfo().username; } catch { return null; }
    })() ?? role;
    const slug = nodeId.includes('-') ? nodeId.split('-').slice(1).join('-') : nodeId.slice(0, 8);
    const hostname = os.hostname();
    const defaultName = `${userPart}@${hostname}:${slug}`;

    // A name "looks auto-generated" if it matches a pattern produced
    // by a previous version of this CLI (just hostname; role@hostname
    // without slug; the makeNodeId form). Operator-chosen names with
    // their own structure are preserved as-is.
    const isStaleAutoName = (n) => {
        if (!n) return true;
        if (n === hostname) return true;
        if (n === `${role}@${hostname}`) return true;
        if (/^(provider|aggregator|client)-[0-9a-f]{8}$/.test(n)) return true;
        return false;
    };

    if (!name) {
        if (upgradeInPlace && existing?.node?.name && !isStaleAutoName(existing.node.name)) {
            // Operator picked this name themselves — keep it.
            name = existing.node.name;
        } else {
            // No name yet, OR existing name is a stale auto-default →
            // regenerate as user@host:slug. Prompts in interactive mode;
            // in --yes mode, question() returns the default so this is
            // a silent self-heal.
            name = await question('Human-readable node name', {
                default: defaultName
            });
        }
    }

    // Merge with any existing config so engine.*, payment.*, and any
    // other top-level sections survive re-running init or running it
    // after `infernet setup`. Only the controlPlane and node fields
    // that init manages are replaced.
    const config = {
        ...(existing ?? {}),
        controlPlane: { ...(existing?.controlPlane ?? {}), url },
        node: {
            ...(existing?.node ?? {}),
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
        const detected = detectFirewall();
        if (detected.length === 0 || process.platform !== 'linux') {
            // Print-only: pf / netsh / no-detected — nothing safe to auto-apply.
            printFirewallHint(port, 'init');
        } else {
            const tool = detected[0];
            const { lines } = describeFirewallHowTo(port);
            process.stdout.write(`-- firewall (init, port ${port}) --\n`);
            process.stdout.write(`Detected: ${tool}\n`);
            for (const line of lines.slice(0, 4)) process.stdout.write(`${line}\n`);
            const yes =
                args.has('yes') ||
                args.has('confirm') ||
                process.env.INFERNET_NONINTERACTIVE === '1';
            let proceed = yes;
            if (!yes) {
                const ans = await question('Apply firewall rule now (will sudo)?', { default: 'y' });
                proceed = ans.toLowerCase().startsWith('y');
            }
            if (proceed) {
                try {
                    const result = await applyFirewallRule(port, { tool });
                    if (result.applied) {
                        process.stdout.write(`Firewall:      ✓ rule applied via ${result.tool}\n`);
                    } else {
                        process.stdout.write(`Firewall:      ! ${result.reason ?? 'skipped'}\n`);
                    }
                } catch (err) {
                    process.stderr.write(`firewall rule failed: ${err?.message ?? err}\n`);
                    process.stderr.write('Re-run later or apply the command manually.\n');
                }
            } else {
                process.stdout.write('Firewall:      skipped — run `infernet firewall` to print the commands\n');
            }
        }
    }

    process.stdout.write('Next:          run `infernet register` to announce this node.\n');
    return 0;
}

export { HELP };
