/**
 * `infernet login`
 *
 * Re-points this node at a different control-plane URL. With signed-request
 * auth (Nostr / BIP-340), there is no password or service-role key to ask
 * for — the node's existing Nostr keypair is the credential. A new control
 * plane just needs this node's pubkey registered.
 */

import { getConfigPath, loadConfig, saveConfig } from '../lib/config.js';
import { question } from '../lib/prompt.js';

const HELP = `infernet login — update the control-plane URL

Usage:
  infernet login [flags]

Flags:
  --url <url>   Control-plane base URL
  --help        Show this help

No credentials are collected; the node's Nostr keypair already proves
ownership on every request.
`;

export default async function login(args) {
    if (args.has('help') || args.has('h')) {
        process.stdout.write(HELP);
        return 0;
    }

    const existing = (await loadConfig()) ?? {};
    const currentUrl = existing.controlPlane?.url ?? '';

    let url = args.get('url');
    if (!url) {
        url = await question('Control-plane URL', { default: currentUrl });
    }
    if (!url) {
        process.stderr.write('Control-plane URL is required.\n');
        return 1;
    }

    const next = {
        ...existing,
        controlPlane: { url }
    };
    if (!next.node) {
        next.node = {
            id: null,
            nodeId: null,
            role: null,
            name: null,
            publicKey: null,
            privateKey: null
        };
    }

    const written = await saveConfig(next);
    process.stdout.write(`Updated ${written}\n`);
    process.stdout.write(`Control plane: ${url}\n`);
    if (!existing.node || !existing.node.nodeId) {
        process.stdout.write('Next:          run `infernet init` to configure node identity, or `infernet register`.\n');
    }
    return 0;
}

export { HELP };
