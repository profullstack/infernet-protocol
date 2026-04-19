/**
 * `infernet status` — print the current state of this node.
 *
 * When the daemon is alive, we merge its live IPC snapshot with the
 * persisted Supabase row. When it isn't, we fall back to the Supabase row
 * alone so operators can still see how the control plane sees this node.
 */

import { isDaemonAlive, sendToDaemon } from '../lib/ipc.js';
import { formatEndpoint } from '../lib/network.js';

const HELP = `infernet status — show this node's state

Usage:
  infernet status [flags]

Flags:
  --json    Print JSON combining Supabase row + live daemon snapshot
  --help    Show this help
`;

function tableFor(role) {
    switch (role) {
        case 'provider':   return 'providers';
        case 'aggregator': return 'aggregators';
        case 'client':     return 'clients';
        default: throw new Error(`Unknown role "${role}"`);
    }
}

function fmtUptime(ms) {
    if (!Number.isFinite(ms) || ms < 0) return '?';
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    if (h > 0) return `${h}h${m}m${r}s`;
    if (m > 0) return `${m}m${r}s`;
    return `${r}s`;
}

export default async function status(args, ctx) {
    if (args.has('help') || args.has('h')) {
        process.stdout.write(HELP);
        return 0;
    }

    const { config, supabase } = ctx;
    const node = config.node ?? {};
    if (!node.role || !node.nodeId) {
        process.stderr.write('Config is missing node.role/node.nodeId. Run `infernet init` first.\n');
        return 1;
    }

    const table = tableFor(node.role);

    const { data: row, error } = await supabase
        .from(table).select('*').eq('node_id', node.nodeId).maybeSingle();
    if (error) {
        process.stderr.write(`Supabase error: ${error.message}\n`);
        return 1;
    }
    if (!row) {
        process.stderr.write(
            `No row found in ${table} for node_id "${node.nodeId}". Run \`infernet register\`.\n`
        );
        return 1;
    }

    // Best-effort daemon snapshot.
    let daemon = null;
    if (await isDaemonAlive()) {
        const res = await sendToDaemon('status', null, { timeoutMs: 2000 });
        if (res.ok) daemon = res.data;
    }

    if (args.has('json')) {
        process.stdout.write(JSON.stringify({ row, daemon }, null, 2) + '\n');
        return 0;
    }

    process.stdout.write(`Role:       ${node.role}\n`);
    process.stdout.write(`Name:       ${row.name ?? node.name ?? '(unnamed)'}\n`);
    process.stdout.write(`node_id:    ${row.node_id ?? node.nodeId}\n`);
    process.stdout.write(`uuid:       ${row.id}\n`);
    process.stdout.write(`Status:     ${row.status ?? '(unknown)'}${daemon ? ' (daemon running)' : ' (daemon not running)'}\n`);
    process.stdout.write(`Last seen:  ${row.last_seen ?? '(never)'}\n`);
    if (row.reputation !== undefined) process.stdout.write(`Reputation: ${row.reputation}\n`);
    if (row.price !== undefined)     process.stdout.write(`Price:      ${row.price}\n`);
    if (row.address) {
        process.stdout.write(`Endpoint:   ${formatEndpoint(row.address, row.port ?? 0)}\n`);
    }

    if (row.specs && row.specs.gpus && Array.isArray(row.specs.gpus) && row.specs.gpus.length > 0) {
        process.stdout.write(`GPUs:       ${row.specs.gpus.length}\n`);
        for (const g of row.specs.gpus) {
            const vram = g.vram_mb ? `${(g.vram_mb / 1024).toFixed(1)} GB` : 'VRAM?';
            process.stdout.write(`  - [${g.vendor}:${g.index}] ${g.model} — ${vram}${g.cuda ? ` cuda=${g.cuda}` : ''}\n`);
        }
    }

    if (daemon) {
        process.stdout.write(`\nDaemon:     pid=${daemon.pid}, uptime=${fmtUptime(daemon.uptimeMs)}\n`);
        if (daemon.p2p?.enabled) {
            process.stdout.write(`  p2p:      ${daemon.p2p.endpoint} (connections: ${daemon.p2p.connectionsTotal})\n`);
        }
        const s = daemon.stats ?? {};
        process.stdout.write(`  heartbeats: ok=${s.heartbeatsOk} failed=${s.heartbeatsFailed}\n`);
        process.stdout.write(`  jobs:       completed=${s.jobsCompleted} active=${s.activeJobs}\n`);
    }

    if (node.role === 'provider') {
        const { data: txs, error: txErr } = await supabase
            .from('payment_transactions')
            .select('amount_usd,status,direction')
            .eq('provider_id', row.id)
            .eq('direction', 'outbound');
        if (txErr) {
            process.stderr.write(`earnings query error: ${txErr.message}\n`);
        } else {
            const sum = (list) => list.reduce((a, t) => a + (Number.parseFloat(t.amount_usd) || 0), 0);
            const confirmed = (txs ?? []).filter((t) => t.status === 'confirmed');
            const pending = (txs ?? []).filter((t) => t.status === 'pending');
            process.stdout.write(`Earnings:   $${sum(confirmed).toFixed(2)} confirmed, $${sum(pending).toFixed(2)} pending (USD)\n`);
        }
    }
    return 0;
}

export { HELP };
