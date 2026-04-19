/**
 * `infernet start` — run the node daemon loop.
 *
 * By default, `infernet start` spawns a **detached** background process and
 * returns immediately; logs go to `~/.config/infernet/daemon.log`. Use
 * `--foreground` to run the loop in the current terminal (useful under
 * systemd / Docker / Kubernetes where the supervisor wants the process in
 * the foreground).
 *
 * The running daemon:
 *   - Heartbeats every 30s (UPDATE <table> SET last_seen = now(), status = 'available')
 *   - Polls `jobs` every 15s (providers only): picks up `status='assigned'`
 *     rows assigned to this node, stub-executes, marks completed, records
 *     an outbound payment_transactions row.
 *   - Exposes a Unix-domain IPC socket at `~/.config/infernet/daemon.sock`
 *     so `infernet status`, `infernet stats`, `infernet stop`, etc. can ask
 *     the live process what it's doing.
 *   - Handles SIGINT / SIGTERM: sets `status='offline'`, removes pid/sock
 *     files, exits 0.
 */

import fs from 'node:fs/promises';
import net from 'node:net';
import { chmodSync, unlinkSync } from 'node:fs';

import {
    getDaemonPidPath,
    getDaemonSocketPath,
    getDaemonLogPath,
    saveConfig
} from '../lib/config.js';
import { spawnDetachedDaemon } from '../lib/daemonize.js';
import { isDaemonAlive } from '../lib/ipc.js';
import { resolveP2pPort, detectLocalAddress, formatEndpoint } from '../lib/network.js';
import { executeChatJob, failChatJob } from '../lib/chat-executor.js';

const HELP = `infernet start — run the node daemon

Usage:
  infernet start [flags]

Flags:
  --foreground               Run in the current terminal (don't detach)
  --heartbeat-interval <ms>  Override heartbeat cadence (default 30000)
  --poll-interval <ms>       Override job poll cadence (default 15000)
  --p2p-port <n>             TCP port for peer connections (default 46337)
  --no-p2p                   Don't bind the P2P TCP listener
  --once                     Run one heartbeat + one poll and exit (debug)
  --help                     Show this help

By default, \`infernet start\` detaches into the background, logs to
\`~/.config/infernet/daemon.log\`, and exposes an IPC socket for live
queries (see \`infernet status\`, \`infernet stats\`, \`infernet logs\`).
`;

const DEFAULT_HEARTBEAT_MS = 30_000;
const DEFAULT_POLL_MS = 15_000;

function tableFor(role) {
    switch (role) {
        case 'provider':   return 'providers';
        case 'aggregator': return 'aggregators';
        case 'client':     return 'clients';
        default: throw new Error(`Unknown role "${role}"`);
    }
}

async function writePidFile(pid) {
    const p = getDaemonPidPath();
    await fs.writeFile(p, String(pid), { mode: 0o600 });
    return p;
}

async function removePidFile() {
    try { await fs.unlink(getDaemonPidPath()); } catch { /* ignore */ }
}

function removeSocketFile() {
    try { unlinkSync(getDaemonSocketPath()); } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Entry point — branch between "spawn detached" and "run foreground loop".
// ---------------------------------------------------------------------------
export default async function start(args, ctx) {
    if (args.has('help') || args.has('h')) {
        process.stdout.write(HELP);
        return 0;
    }

    const foreground = args.has('foreground') || process.env.INFERNET_DAEMON_FOREGROUND === '1';
    if (!foreground) {
        return spawnAndReturn(args);
    }
    return runDaemon(args, ctx);
}

// ---------------------------------------------------------------------------
// Detached-spawn path.
// ---------------------------------------------------------------------------
async function spawnAndReturn(args) {
    const alreadyAlive = await isDaemonAlive();
    if (alreadyAlive) {
        process.stderr.write('A daemon is already running (socket responsive). Run `infernet stop` first.\n');
        return 1;
    }
    // Stale socket? Remove so the child can bind.
    removeSocketFile();

    const passthrough = [];
    const hb = args.get('heartbeat-interval');
    if (hb) passthrough.push('--heartbeat-interval', hb);
    const poll = args.get('poll-interval');
    if (poll) passthrough.push('--poll-interval', poll);
    const p2pPort = args.get('p2p-port');
    if (p2pPort) passthrough.push('--p2p-port', p2pPort);
    if (args.has('no-p2p')) passthrough.push('--no-p2p');
    if (args.has('once')) passthrough.push('--once');

    const { pid, logPath } = spawnDetachedDaemon(passthrough);
    process.stdout.write(`infernet daemon started (pid ${pid})\n`);
    process.stdout.write(`  logs:   ${logPath}\n`);
    process.stdout.write(`  socket: ${getDaemonSocketPath()}\n`);
    process.stdout.write('Tail logs with `infernet logs -f`, query live state with `infernet status`.\n');
    return 0;
}

// ---------------------------------------------------------------------------
// Foreground-daemon path.
// ---------------------------------------------------------------------------
async function runDaemon(args, ctx) {
    const { config, supabase, configPath } = ctx;
    const node = config.node ?? {};
    if (!node.role || !node.nodeId) {
        process.stderr.write('Config is missing node.role/node.nodeId. Run `infernet init` first.\n');
        return 1;
    }

    const table = tableFor(node.role);

    // Resolve uuid if missing.
    if (!node.id) {
        const { data, error } = await supabase
            .from(table).select('id').eq('node_id', node.nodeId).maybeSingle();
        if (error) {
            process.stderr.write(`lookup error: ${error.message}\n`);
            return 1;
        }
        if (!data) {
            process.stderr.write('This node has no row in Supabase yet. Run `infernet register` first.\n');
            return 1;
        }
        node.id = data.id;
        await saveConfig({ ...config, node });
    }

    const heartbeatMs = Number.parseInt(args.get('heartbeat-interval') ?? '', 10) || DEFAULT_HEARTBEAT_MS;
    const pollMs     = Number.parseInt(args.get('poll-interval') ?? '', 10)      || DEFAULT_POLL_MS;
    const once       = args.has('once');

    const p2pDisabled = args.has('no-p2p');
    const p2pPort = Number.parseInt(args.get('p2p-port') ?? '', 10) || resolveP2pPort(config);
    const advertisedAddress = config.node?.address ?? detectLocalAddress();

    // In-memory state exposed via IPC.
    const startedAt = new Date();
    const stats = {
        heartbeatsOk: 0,
        heartbeatsFailed: 0,
        lastHeartbeatAt: null,
        lastHeartbeatError: null,
        jobsPicked: 0,
        jobsCompleted: 0,
        jobsFailed: 0,
        lastJobAt: null,
        lastPollAt: null,
        pollsOk: 0,
        pollsFailed: 0,
        activeJobIds: new Set()
    };

    const pidPath = await writePidFile(process.pid);
    const socketPath = getDaemonSocketPath();
    removeSocketFile(); // clear any stale

    process.stdout.write('infernet daemon starting\n');
    process.stdout.write(`  node_id:   ${node.nodeId}\n`);
    process.stdout.write(`  uuid:      ${node.id}\n`);
    process.stdout.write(`  role:      ${node.role}\n`);
    process.stdout.write(`  supabase:  ${config.supabase.url}\n`);
    process.stdout.write(`  pid:       ${process.pid}\n`);
    process.stdout.write(`  pidfile:   ${pidPath}\n`);
    process.stdout.write(`  socket:    ${socketPath}\n`);
    process.stdout.write(`  config:    ${configPath}\n`);
    process.stdout.write(`  heartbeat: ${heartbeatMs}ms\n`);
    process.stdout.write(`  poll:      ${pollMs}ms\n`);
    if (!p2pDisabled) {
        process.stdout.write(`  p2p:       ${formatEndpoint(advertisedAddress, p2pPort)}\n`);
    } else {
        process.stdout.write('  p2p:       disabled\n');
    }

    let heartbeatTimer = null;
    let pollTimer = null;
    let shuttingDown = false;
    let ipcServer = null;
    let p2pServer = null;
    let p2pConnections = 0;
    let p2pLastConnectionAt = null;

    // -----------------------------------------------------------------------
    // Heartbeat + job loop
    // -----------------------------------------------------------------------
    async function heartbeat() {
        const patch = { last_seen: new Date().toISOString(), status: 'available' };
        if (!p2pDisabled) {
            if (advertisedAddress) patch.address = advertisedAddress;
            patch.port = p2pPort;
        }
        const { error } = await supabase
            .from(table)
            .update(patch)
            .eq('id', node.id);
        if (error) {
            stats.heartbeatsFailed += 1;
            stats.lastHeartbeatError = error.message;
            process.stderr.write(`heartbeat error: ${error.message}\n`);
        } else {
            stats.heartbeatsOk += 1;
            stats.lastHeartbeatAt = new Date().toISOString();
            stats.lastHeartbeatError = null;
            process.stdout.write(`[${stats.lastHeartbeatAt}] heartbeat ok\n`);
        }
    }

    async function processJob(job) {
        const t0 = new Date().toISOString();
        stats.jobsPicked += 1;
        stats.activeJobIds.add(job.id);
        stats.lastJobAt = t0;
        process.stdout.write(`[${t0}] picking up job ${job.id} type=${job.type ?? 'inference'} (${job.title ?? 'untitled'})\n`);

        const markRunning = await supabase
            .from('jobs')
            .update({ status: 'running', updated_at: t0 })
            .eq('id', job.id);
        if (markRunning.error) {
            stats.jobsFailed += 1;
            stats.activeJobIds.delete(job.id);
            process.stderr.write(`failed to mark job ${job.id} running: ${markRunning.error.message}\n`);
            return;
        }

        let resultPayload;
        try {
            if (job.type === 'chat') {
                const text = await executeChatJob({ supabase, job, node });
                resultPayload = { type: 'chat', text, completed_by: node.nodeId };
            } else {
                // Generic inference stub — briefly sleep to simulate compute.
                await new Promise((resolve) => setTimeout(resolve, 500));
                resultPayload = { stub: true, completed_by: node.nodeId };
            }
        } catch (err) {
            stats.jobsFailed += 1;
            stats.activeJobIds.delete(job.id);
            const msg = err?.message ?? String(err);
            process.stderr.write(`job ${job.id} threw during execution: ${msg}\n`);
            if (job.type === 'chat') {
                await failChatJob({ supabase, jobId: job.id, message: msg });
            }
            const failedAt = new Date().toISOString();
            await supabase
                .from('jobs')
                .update({ status: 'failed', error: msg, updated_at: failedAt, completed_at: failedAt })
                .eq('id', job.id);
            return;
        }

        const completedAt = new Date().toISOString();
        const markDone = await supabase
            .from('jobs')
            .update({
                status: 'completed',
                updated_at: completedAt,
                completed_at: completedAt,
                result: resultPayload
            })
            .eq('id', job.id);
        if (markDone.error) {
            stats.jobsFailed += 1;
            stats.activeJobIds.delete(job.id);
            process.stderr.write(`failed to mark job ${job.id} completed: ${markDone.error.message}\n`);
            return;
        }

        const amount = Number.parseFloat(job.payment_offer ?? 0) || 0;
        if (amount > 0) {
            const coin = job.payment_coin ?? 'USDC';
            const payTx = await supabase.from('payment_transactions').insert({
                direction: 'outbound',
                job_id: job.id,
                provider_id: node.id,
                coin,
                amount,
                amount_usd: amount,
                address: 'pending-payout',
                status: 'pending',
                metadata: { stub: true, node_id: node.nodeId }
            });
            if (payTx.error) {
                process.stderr.write(`failed to record payment_transactions for job ${job.id}: ${payTx.error.message}\n`);
            }
        }

        stats.jobsCompleted += 1;
        stats.activeJobIds.delete(job.id);
        process.stdout.write(`[${completedAt}] completed job ${job.id} type=${job.type ?? 'inference'}\n`);
    }

    async function pollJobs() {
        stats.lastPollAt = new Date().toISOString();
        if (node.role !== 'provider' || !node.id) {
            stats.pollsOk += 1;
            return;
        }
        const { data, error } = await supabase
            .from('jobs')
            .select('*')
            .eq('provider_id', node.id)
            .in('status', ['assigned'])
            .order('created_at', { ascending: true })
            .limit(5);
        if (error) {
            stats.pollsFailed += 1;
            process.stderr.write(`job poll error: ${error.message}\n`);
            return;
        }
        stats.pollsOk += 1;
        for (const job of data ?? []) await processJob(job);
    }

    // -----------------------------------------------------------------------
    // IPC server
    // -----------------------------------------------------------------------
    function snapshot() {
        return {
            pid: process.pid,
            startedAt: startedAt.toISOString(),
            uptimeMs: Date.now() - startedAt.getTime(),
            node: {
                nodeId: node.nodeId,
                id: node.id,
                role: node.role,
                name: node.name ?? null
            },
            supabaseUrl: config.supabase.url,
            intervals: { heartbeatMs, pollMs },
            stats: {
                heartbeatsOk: stats.heartbeatsOk,
                heartbeatsFailed: stats.heartbeatsFailed,
                lastHeartbeatAt: stats.lastHeartbeatAt,
                lastHeartbeatError: stats.lastHeartbeatError,
                jobsPicked: stats.jobsPicked,
                jobsCompleted: stats.jobsCompleted,
                jobsFailed: stats.jobsFailed,
                activeJobs: stats.activeJobIds.size,
                activeJobIds: Array.from(stats.activeJobIds),
                lastJobAt: stats.lastJobAt,
                pollsOk: stats.pollsOk,
                pollsFailed: stats.pollsFailed,
                lastPollAt: stats.lastPollAt
            },
            p2p: p2pDisabled ? { enabled: false } : {
                enabled: true,
                port: p2pPort,
                address: advertisedAddress,
                endpoint: formatEndpoint(advertisedAddress, p2pPort),
                connectionsTotal: p2pConnections,
                lastConnectionAt: p2pLastConnectionAt
            }
        };
    }

    function startIpcServer() {
        return new Promise((resolve, reject) => {
            const server = net.createServer((sock) => {
                let buf = '';
                sock.setEncoding('utf8');
                sock.on('data', async (chunk) => {
                    buf += chunk;
                    // Process all complete lines.
                    for (;;) {
                        const nl = buf.indexOf('\n');
                        if (nl < 0) break;
                        const line = buf.slice(0, nl);
                        buf = buf.slice(nl + 1);
                        let msg;
                        try { msg = JSON.parse(line); }
                        catch (err) {
                            sock.write(JSON.stringify({ ok: false, error: 'bad-json', cause: err?.message ?? String(err) }) + '\n');
                            continue;
                        }
                        const reply = await handleIpc(msg);
                        try { sock.write(JSON.stringify(reply) + '\n'); } catch { /* ignore */ }
                    }
                });
                sock.on('error', () => { /* ignore client disconnects */ });
            });

            server.once('error', reject);
            server.listen(socketPath, () => {
                try { chmodSync(socketPath, 0o600); } catch { /* ignore */ }
                resolve(server);
            });
        });
    }

    async function handleIpc(msg) {
        const cmd = msg?.cmd;
        switch (cmd) {
            case 'ping':
                return { ok: true, data: { pong: Date.now() } };
            case 'status':
            case 'stats':
                return { ok: true, data: snapshot() };
            case 'shutdown':
                setImmediate(() => shutdown('ipc-shutdown'));
                return { ok: true, data: { shuttingDown: true } };
            default:
                return { ok: false, error: `unknown-cmd: ${cmd ?? '(none)'}` };
        }
    }

    // -----------------------------------------------------------------------
    // P2P TCP listener (newline-JSON protocol, same as IPC)
    // -----------------------------------------------------------------------
    function startP2pServer() {
        return new Promise((resolve, reject) => {
            const server = net.createServer((sock) => {
                p2pConnections += 1;
                p2pLastConnectionAt = new Date().toISOString();
                sock.setEncoding('utf8');
                let buf = '';
                sock.on('data', async (chunk) => {
                    buf += chunk;
                    for (;;) {
                        const nl = buf.indexOf('\n');
                        if (nl < 0) break;
                        const line = buf.slice(0, nl);
                        buf = buf.slice(nl + 1);
                        let msg;
                        try { msg = JSON.parse(line); }
                        catch (err) {
                            try { sock.write(JSON.stringify({ ok: false, error: 'bad-json', cause: err?.message ?? String(err) }) + '\n'); } catch { /* ignore */ }
                            continue;
                        }
                        // Peer-facing surface is intentionally narrower than
                        // the local IPC (no shutdown allowed remotely).
                        let reply;
                        switch (msg?.cmd) {
                            case 'ping':
                                reply = { ok: true, data: { pong: Date.now(), node_id: node.nodeId } };
                                break;
                            case 'info':
                                reply = { ok: true, data: {
                                    node_id: node.nodeId,
                                    role: node.role,
                                    name: node.name ?? null,
                                    port: p2pPort
                                } };
                                break;
                            default:
                                reply = { ok: false, error: `unknown-cmd: ${msg?.cmd ?? '(none)'}` };
                        }
                        try { sock.write(JSON.stringify(reply) + '\n'); } catch { /* ignore */ }
                    }
                });
                sock.on('error', () => { /* ignore peer disconnects */ });
            });

            server.once('error', reject);
            // Bind to `::` so we accept both IPv6 and IPv4 (dual-stack).
            server.listen({ port: p2pPort, host: '::', ipv6Only: false }, () => {
                resolve(server);
            });
        });
    }

    // -----------------------------------------------------------------------
    // Shutdown
    // -----------------------------------------------------------------------
    const shutdown = async (signal) => {
        if (shuttingDown) return;
        shuttingDown = true;
        process.stdout.write(`\nReceived ${signal}; shutting down...\n`);
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        if (pollTimer) clearInterval(pollTimer);
        try {
            const { error } = await supabase
                .from(table)
                .update({ status: 'offline', last_seen: new Date().toISOString() })
                .eq('id', node.id);
            if (error) process.stderr.write(`offline update failed: ${error.message}\n`);
        } catch (err) {
            process.stderr.write(`offline update threw: ${err?.message ?? err}\n`);
        }
        try { await supabase.removeAllChannels(); } catch { /* ignore */ }
        if (ipcServer) {
            try { ipcServer.close(); } catch { /* ignore */ }
        }
        if (p2pServer) {
            try { p2pServer.close(); } catch { /* ignore */ }
        }
        removeSocketFile();
        await removePidFile();
        process.stdout.write('bye\n');
        process.exit(0);
    };

    process.on('SIGINT',  () => { shutdown('SIGINT');  });
    process.on('SIGTERM', () => { shutdown('SIGTERM'); });

    // Bring up the IPC server before the first heartbeat so callers can
    // query the daemon as soon as it appears alive.
    try {
        ipcServer = await startIpcServer();
        process.stdout.write(`IPC listening on ${socketPath}\n`);
    } catch (err) {
        process.stderr.write(`Failed to bind IPC socket at ${socketPath}: ${err?.message ?? err}\n`);
        // Non-fatal — keep running, the CLI will just fall back to Supabase queries.
    }

    if (!p2pDisabled) {
        try {
            p2pServer = await startP2pServer();
            process.stdout.write(`P2P listening on ${formatEndpoint(advertisedAddress, p2pPort)} (dual-stack)\n`);
        } catch (err) {
            const cause = err?.code === 'EADDRINUSE'
                ? ` (port ${p2pPort} is already in use — pick another with --p2p-port)`
                : err?.code === 'EACCES'
                    ? ` (permission denied — try a port above 1024)`
                    : '';
            process.stderr.write(`Failed to bind P2P listener on port ${p2pPort}${cause}: ${err?.message ?? err}\n`);
            process.stderr.write('If this is a firewall issue, run `infernet firewall` for per-distro commands.\n');
        }
    }

    await heartbeat();
    await pollJobs();

    if (once) {
        if (ipcServer) { try { ipcServer.close(); } catch { /* ignore */ } }
        if (p2pServer) { try { p2pServer.close(); } catch { /* ignore */ } }
        removeSocketFile();
        await removePidFile();
        return 0;
    }

    heartbeatTimer = setInterval(() => {
        heartbeat().catch((err) => process.stderr.write(`heartbeat threw: ${err?.message ?? err}\n`));
    }, heartbeatMs);
    pollTimer = setInterval(() => {
        pollJobs().catch((err) => process.stderr.write(`poll threw: ${err?.message ?? err}\n`));
    }, pollMs);

    await new Promise(() => {}); // keep the event loop alive
    return 0;
}

export { HELP };
