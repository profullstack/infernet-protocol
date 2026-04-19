/**
 * `infernet stats` — query the running daemon via IPC and print its
 * in-memory snapshot (heartbeats, polls, active jobs, uptime, P2P).
 */

import { isDaemonAlive, sendToDaemon } from '../lib/ipc.js';

const HELP = `infernet stats — show live daemon stats via IPC

Usage:
  infernet stats [flags]

Flags:
  --json    Print the raw JSON snapshot
  --help    Show this help

Requires a running daemon (\`infernet start\`). For the persisted
per-node state from Supabase, use \`infernet status\` instead.
`;

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

export default async function stats(args) {
    if (args.has('help') || args.has('h')) {
        process.stdout.write(HELP);
        return 0;
    }

    const alive = await isDaemonAlive();
    if (!alive) {
        process.stderr.write('Daemon not reachable (socket missing or unresponsive). Run `infernet start` first.\n');
        return 1;
    }

    const res = await sendToDaemon('stats');
    if (!res.ok) {
        process.stderr.write(`IPC error: ${res.error}${res.cause ? ` (${res.cause})` : ''}\n`);
        return 1;
    }

    if (args.has('json')) {
        process.stdout.write(JSON.stringify(res.data, null, 2) + '\n');
        return 0;
    }

    const d = res.data;
    process.stdout.write(`Daemon pid:    ${d.pid}\n`);
    process.stdout.write(`Started at:    ${d.startedAt}\n`);
    process.stdout.write(`Uptime:        ${fmtUptime(d.uptimeMs)}\n`);
    process.stdout.write(`Node:          ${d.node.nodeId} (${d.node.role})\n`);
    process.stdout.write(`Supabase:      ${d.supabaseUrl}\n`);
    process.stdout.write(`Intervals:     heartbeat=${d.intervals.heartbeatMs}ms poll=${d.intervals.pollMs}ms\n`);

    if (d.p2p?.enabled) {
        process.stdout.write(`P2P:           ${d.p2p.endpoint} (connections: ${d.p2p.connectionsTotal}`);
        if (d.p2p.lastConnectionAt) {
            process.stdout.write(`, last: ${d.p2p.lastConnectionAt}`);
        }
        process.stdout.write(')\n');
    } else {
        process.stdout.write('P2P:           disabled\n');
    }

    const s = d.stats ?? {};
    process.stdout.write(`\nHeartbeats:    ok=${s.heartbeatsOk} failed=${s.heartbeatsFailed} last=${s.lastHeartbeatAt ?? '-'}\n`);
    if (s.lastHeartbeatError) process.stdout.write(`  last error:  ${s.lastHeartbeatError}\n`);
    process.stdout.write(`Polls:         ok=${s.pollsOk} failed=${s.pollsFailed} last=${s.lastPollAt ?? '-'}\n`);
    process.stdout.write(`Jobs:          picked=${s.jobsPicked} completed=${s.jobsCompleted} failed=${s.jobsFailed} active=${s.activeJobs}\n`);
    if (s.activeJobs > 0) {
        process.stdout.write(`  active ids:  ${s.activeJobIds.join(', ')}\n`);
    }
    if (s.lastJobAt) process.stdout.write(`  last job at: ${s.lastJobAt}\n`);
    return 0;
}

export { HELP };
