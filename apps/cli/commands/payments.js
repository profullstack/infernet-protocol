/**
 * `infernet payments list [--limit N]`
 *
 * Prints the last N payment_transactions rows involving this node, fetched
 * via signed POST to /api/v1/node/payments/list.
 */

const HELP = `infernet payments — show recent payment transactions

Usage:
  infernet payments list [--limit N]
  infernet payments --help

Flags:
  --limit N   Number of rows to show (default 20)
`;

function formatDate(ts) {
    if (!ts) return '(no date)';
    try {
        return new Date(ts).toISOString().replace('T', ' ').replace(/\.\d+Z$/, 'Z');
    } catch {
        return String(ts);
    }
}

function tableRows(rows) {
    const header = ['created', 'dir', 'coin', 'amount', 'usd', 'status', 'tx/invoice'];
    const body = rows.map((r) => [
        formatDate(r.created_at),
        r.direction ?? '',
        r.coin ?? '',
        String(r.amount ?? ''),
        r.amount_usd != null ? `$${Number.parseFloat(r.amount_usd).toFixed(2)}` : '',
        r.status ?? '',
        r.tx_hash ?? r.invoice_id ?? ''
    ]);
    const all = [header, ...body];
    const widths = header.map((_, i) =>
        all.reduce((w, row) => Math.max(w, String(row[i] ?? '').length), 0)
    );
    return all
        .map((row) => row.map((cell, i) => String(cell ?? '').padEnd(widths[i])).join('  '))
        .join('\n');
}

async function runList(args, ctx) {
    const { config, client } = ctx;
    const node = config.node ?? {};
    if (node.role !== 'provider' && node.role !== 'client') {
        process.stderr.write('Only provider/client nodes have payment transactions.\n');
        return 1;
    }

    const limit = Math.max(1, Number.parseInt(args.get('limit') ?? '20', 10) || 20);
    let result;
    try {
        result = await client.listPayments(limit);
    } catch (err) {
        process.stderr.write(`payments list failed: ${err?.message ?? err}\n`);
        return 1;
    }

    const rows = result?.rows ?? [];
    if (!rows.length) {
        process.stdout.write('(no payment transactions)\n');
        return 0;
    }
    process.stdout.write(tableRows(rows) + '\n');
    return 0;
}

export default async function payments(args, ctx) {
    if (args.has('help') || args.has('h')) {
        process.stdout.write(HELP);
        return 0;
    }

    const positional = args.positional ?? [];
    const sub = positional[0] ?? 'list';

    switch (sub) {
        case 'list':
            return runList(args, ctx);
        default:
            process.stderr.write(`Unknown payments subcommand "${sub}".\n`);
            process.stderr.write(HELP);
            return 1;
    }
}

export { HELP };
