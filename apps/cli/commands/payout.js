/**
 * `infernet payout` — manage this provider's payout coin/address via the
 * signed node API.
 *
 * Subcommands:
 *   infernet payout set <coin> <address> [--network <name>]
 *   infernet payout list
 */

import { PAYMENT_COINS, PAYMENT_COIN_CODES } from '@infernetprotocol/config/payment-coins';

const HELP = `infernet payout — manage payout coin/address

Usage:
  infernet payout set <coin> <address> [--network <name>]
  infernet payout list
  infernet payout --help

Supported coins: ${PAYMENT_COIN_CODES.join(', ')}
`;

function pickNetwork(coin, requestedNetwork) {
    const upper = String(coin).toUpperCase();
    const matches = PAYMENT_COINS.filter((c) => c.code === upper);
    if (matches.length === 0) return null;
    if (requestedNetwork) {
        const hit = matches.find((c) => c.network === requestedNetwork);
        return hit ? hit.network : null;
    }
    return matches[0].network;
}

async function runList(args, ctx) {
    const { config, client } = ctx;
    const node = config.node ?? {};
    if (node.role !== 'provider') {
        process.stderr.write('Payouts are only configurable for providers.\n');
        return 1;
    }

    let result;
    try {
        result = await client.listPayouts();
    } catch (err) {
        process.stderr.write(`payout list failed: ${err?.message ?? err}\n`);
        return 1;
    }
    const rows = result?.rows ?? [];
    if (!rows.length) {
        process.stdout.write('(no payout addresses configured)\n');
        process.stdout.write('Use `infernet payout set <coin> <address>` to add one.\n');
        return 0;
    }
    for (const row of rows) {
        const marker = row.is_default ? '* ' : '  ';
        const net = row.network ? ` (${row.network})` : '';
        process.stdout.write(`${marker}${row.coin}${net}  ${row.address}\n`);
    }
    return 0;
}

async function runSet(args, ctx, positional) {
    const [coinArg, addressArg] = positional;
    if (!coinArg || !addressArg) {
        process.stderr.write('Usage: infernet payout set <coin> <address> [--network <name>]\n');
        return 1;
    }
    const coin = coinArg.toUpperCase();
    if (!PAYMENT_COIN_CODES.includes(coin)) {
        process.stderr.write(
            `Unsupported coin "${coin}". Supported: ${PAYMENT_COIN_CODES.join(', ')}\n`
        );
        return 1;
    }
    const requestedNetwork = args.get('network');
    const network = pickNetwork(coin, requestedNetwork);
    if (!network) {
        process.stderr.write(
            `Coin "${coin}" has no network "${requestedNetwork}". Check config/payment-coins.js.\n`
        );
        return 1;
    }

    const { config, client } = ctx;
    if ((config.node?.role) !== 'provider') {
        process.stderr.write('Payouts are only configurable for providers.\n');
        return 1;
    }

    try {
        await client.setPayout({ coin, network, address: addressArg });
    } catch (err) {
        process.stderr.write(`payout set failed: ${err?.message ?? err}\n`);
        return 1;
    }
    process.stdout.write(`Set default payout: ${coin} (${network}) ${addressArg}\n`);
    return 0;
}

export default async function payout(args, ctx) {
    if (args.has('help') || args.has('h')) {
        process.stdout.write(HELP);
        return 0;
    }

    const positional = args.positional ?? [];
    const sub = positional[0];

    if (!sub) {
        process.stderr.write(HELP);
        return 1;
    }

    const rest = positional.slice(1);

    switch (sub) {
        case 'list':
            return runList(args, ctx);
        case 'set':
            return runSet(args, ctx, rest);
        default:
            process.stderr.write(`Unknown payout subcommand "${sub}".\n`);
            process.stderr.write(HELP);
            return 1;
    }
}

export { HELP };
