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
 *   - Heartbeats every 30s via signed POST /api/v1/node/heartbeat
 *   - Polls /api/v1/node/jobs/poll every 15s (providers only), processes
 *     any returned jobs, emits streaming events via signed
 *     POST /api/v1/node/jobs/:id/events, and closes the loop with
 *     POST /api/v1/node/jobs/:id/complete.
 *   - Exposes a Unix-domain IPC socket at `~/.config/infernet/daemon.sock`
 *     so `infernet status`, `infernet stats`, `infernet stop`, etc. can ask
 *     the live process what it's doing.
 *   - Handles SIGINT / SIGTERM: sends a final heartbeat with status=offline,
 *     removes pid/sock files, exits 0.
 *
 * The daemon never holds a database credential. Every request to the
 * control plane is signed with the node's Nostr privkey.
 */

import fs from 'node:fs/promises';
import net from 'node:net';
import { chmodSync, unlinkSync } from 'node:fs';

import {
    getDaemonPidPath,
    getDaemonSocketPath,
    saveConfig
} from '../lib/config.js';
import { spawnDetachedDaemon } from '../lib/daemonize.js';
import { isDaemonAlive } from '../lib/ipc.js';
import { resolveP2pPort, detectLocalAddress, formatEndpoint } from '../lib/network.js';
import { executeChatJob, failChatJob, shutdownEngine } from '../lib/chat-executor.js';
import { gatherCoarseSpecs } from './register.js';

const HELP = `infernet start — run the node daemon

Usage:
  infernet start [flags]

Flags:
  --foreground               Run in the current terminal (don't detach)
  --heartbeat-interval <ms>  Override heartbeat cadence (default 30000)
  --poll-interval <ms>       Override job poll cadence (default 15000)
  --p2p-port <n>             TCP port for peer connections (default 46337)
  --no-p2p                   Don't bind the P2P TCP listener
  --no-advertise             Don't send address/port in heartbeats
  --once                     Run one heartbeat + one poll and exit (debug)
  --help                     Show this help

Daemon logs to \`~/.config/infernet/daemon.log\`, exposes an IPC socket for
live queries (see \`infernet status\`, \`infernet stats\`, \`infernet logs\`).
`;

const DEFAULT_HEARTBEAT_MS = 30_000;
const DEFAULT_POLL_MS = 15_000;

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

async function spawnAndReturn(args) {
    const alreadyAlive = await isDaemonAlive();
    if (alreadyAlive) {
        process.stderr.write('A daemon is already running (socket responsive). Run `infernet stop` first.\n');
        return 1;
    }
    removeSocketFile();

    const passthrough = [];
    const hb = args.get('heartbeat-interval');
    if (hb) passthrough.push('--heartbeat-interval', hb);
    const poll = args.get('poll-interval');
    if (poll) passthrough.push('--poll-interval', poll);
    const p2pPort = args.get('p2p-port');
    if (p2pPort) passthrough.push('--p2p-port', p2pPort);
    if (args.has('no-p2p')) passthrough.push('--no-p2p');
    if (args.has('no-advertise')) passthrough.push('--no-advertise');
    if (args.has('once')) passthrough.push('--once');

    const { pid, logPath } = spawnDetachedDaemon(passthrough);
    process.stdout.write(`infernet daemon started (pid ${pid})\n`);
    process.stdout.write(`  logs:   ${logPath}\n`);
    process.stdout.write(`  socket: ${getDaemonSocketPath()}\n`);
    process.stdout.write('Tail logs with `infernet logs -f`, query live state with `infernet status`.\n');
    return 0;
}

async function runDaemon(args, ctx) {
    const { config, client, configPath } = ctx;
    const node = config.node ?? {};
    if (!node.role || !node.nodeId) {
        process.stderr.write('Config is missing node.role/node.nodeId. Run `infernet init` first.\n');
        return 1;
    }

    const heartbeatMs = Number.parseInt(args.get('heartbeat-interval') ?? '', 10) || DEFAULT_HEARTBEAT_MS;
    const pollMs     = Number.parseInt(args.get('poll-interval') ?? '', 10)      || DEFAULT_POLL_MS;
    const once       = args.has('once');

    const p2pDisabled = args.has('no-p2p');
    const noAdvertise = args.has('no-advertise') || node.address === null;
    const p2pPort = Number.parseInt(args.get('p2p-port') ?? '', 10) || resolveP2pPort(config);
    const advertisedAddress = noAdvertise ? null : (node.address ?? detectLocalAddress());

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
    removeSocketFile();

    process.stdout.write('infernet daemon starting\n');
    process.stdout.write(`  node_id:   ${node.nodeId}\n`);
    process.stdout.write(`  role:      ${node.role}\n`);
    process.stdout.write(`  control:   ${config.controlPlane?.url ?? '(not set)'}\n`);
    process.stdout.write(`  pid:       ${process.pid}\n`);
    process.stdout.write(`  pidfile:   ${pidPath}\n`);
    process.stdout.write(`  socket:    ${socketPath}\n`);
    process.stdout.write(`  config:    ${configPath}\n`);
    process.stdout.write(`  heartbeat: ${heartbeatMs}ms\n`);
    process.stdout.write(`  poll:      ${pollMs}ms\n`);
    if (!p2pDisabled) {
        process.stdout.write(`  p2p:       ${formatEndpoint(advertisedAddress ?? '-', p2pPort)}\n`);
    } else {
        process.stdout.write('  p2p:       disabled\n');
    }
    if (noAdvertise) process.stdout.write('  advertise: off (outbound-only)\n');

    let heartbeatTimer = null;
    let pollTimer = null;
    let shuttingDown = false;
    let ipcServer = null;
    let p2pServer = null;
    let p2pConnections = 0;
    let p2pLastConnectionAt = null;

    // Specs cache — re-detection (nvidia-smi, /sys/class/infiniband, Ollama
    // /api/tags) is cheap but not free. Refresh every SPECS_TTL_MS so the
    // control plane sees current served-models / hardware without paying
    // the detection cost on every 30s heartbeat.
    const SPECS_TTL_MS = 5 * 60 * 1000;
    let cachedSpecs = null;
    let cachedSpecsAt = 0;

    // Rolling benchmark — last N completed chat jobs' (tokens, duration)
    // pairs. Used to compute tokens_per_second_avg for the heartbeat,
    // which feeds speed-aware routing on the control plane. Capped so
    // memory stays bounded across long-running daemons.
    const BENCH_RING_MAX = 32;
    const benchRing = [];

    function recordBench({ token_count, duration_ms }) {
        if (!Number.isFinite(token_count) || !Number.isFinite(duration_ms) || duration_ms <= 0) return;
        if (token_count <= 0) return;
        benchRing.push({ tokens: token_count, ms: duration_ms, at: Date.now() });
        while (benchRing.length > BENCH_RING_MAX) benchRing.shift();
    }

    function benchSummary() {
        if (benchRing.length === 0) return null;
        const totalTokens = benchRing.reduce((a, e) => a + e.tokens, 0);
        const totalMs = benchRing.reduce((a, e) => a + e.ms, 0);
        if (totalMs <= 0) return null;
        const tps = (totalTokens / totalMs) * 1000;
        return {
            tokens_per_second_avg: +tps.toFixed(2),
            samples: benchRing.length,
            window_started_at: new Date(benchRing[0].at).toISOString()
        };
    }

    async function freshSpecs() {
        if (node.role !== 'provider') return null;
        const now = Date.now();
        let base;
        if (cachedSpecs && now - cachedSpecsAt < SPECS_TTL_MS) {
            base = cachedSpecs;
        } else {
            try {
                cachedSpecs = await gatherCoarseSpecs();
                cachedSpecsAt = now;
                base = cachedSpecs;
            } catch (err) {
                process.stderr.write(`specs detection failed: ${err?.message ?? err}\n`);
                base = cachedSpecs; // fall back to last known good
            }
        }
        if (!base) return null;
        const bench = benchSummary();
        return bench ? { ...base, bench } : base;
    }

    async function heartbeat() {
        const payload = { status: 'available' };
        if (!noAdvertise) {
            if (advertisedAddress) payload.address = advertisedAddress;
            if (!p2pDisabled) payload.port = p2pPort;
        }
        // Provider role only: include current specs so the control plane
        // sees fresh CPU / GPU / served_models without requiring a manual
        // `infernet register` after each capability change.
        const specs = await freshSpecs();
        if (specs) payload.specs = specs;
        try {
            await client.heartbeat(payload);
            stats.heartbeatsOk += 1;
            stats.lastHeartbeatAt = new Date().toISOString();
            stats.lastHeartbeatError = null;
            process.stdout.write(`[${stats.lastHeartbeatAt}] heartbeat ok\n`);
        } catch (err) {
            stats.heartbeatsFailed += 1;
            stats.lastHeartbeatError = err?.message ?? String(err);
            process.stderr.write(`heartbeat error: ${stats.lastHeartbeatError}\n`);
        }
    }

    async function processJob(job) {
        const t0 = new Date().toISOString();
        stats.jobsPicked += 1;
        stats.activeJobIds.add(job.id);
        stats.lastJobAt = t0;
        process.stdout.write(`[${t0}] picking up job ${job.id} type=${job.type ?? 'inference'} (${job.title ?? 'untitled'})\n`);

        try {
            let resultPayload;
            if (job.type === 'chat') {
                const result = await executeChatJob({ client, job, node });
                recordBench(result);
                resultPayload = {
                    type: 'chat',
                    text: result.text,
                    token_count: result.token_count,
                    duration_ms: result.duration_ms,
                    completed_by: node.nodeId
                };
            } else {
                await new Promise((resolve) => setTimeout(resolve, 500));
                resultPayload = { stub: true, completed_by: node.nodeId };
            }
            await client.completeJob(job.id, { status: 'completed', result: resultPayload });
            stats.jobsCompleted += 1;
            stats.activeJobIds.delete(job.id);
            process.stdout.write(`[${new Date().toISOString()}] completed job ${job.id} type=${job.type ?? 'inference'}\n`);
        } catch (err) {
            stats.jobsFailed += 1;
            stats.activeJobIds.delete(job.id);
            const msg = err?.message ?? String(err);
            process.stderr.write(`job ${job.id} failed: ${msg}\n`);
            if (job.type === 'chat') {
                await failChatJob({ client, jobId: job.id, message: msg });
            }
            try {
                await client.failJob(job.id, msg);
            } catch (markErr) {
                process.stderr.write(`failJob failed: ${markErr?.message ?? markErr}\n`);
            }
        }
    }

    async function pollJobs() {
        stats.lastPollAt = new Date().toISOString();
        if (node.role !== 'provider') {
            stats.pollsOk += 1;
            return;
        }
        try {
            const result = await client.pollJobs({ limit: 5 });
            stats.pollsOk += 1;
            for (const job of result?.jobs ?? []) await processJob(job);
        } catch (err) {
            stats.pollsFailed += 1;
            process.stderr.write(`job poll error: ${err?.message ?? err}\n`);
        }
    }

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
            controlPlaneUrl: config.controlPlane?.url ?? null,
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
                endpoint: formatEndpoint(advertisedAddress ?? '-', p2pPort),
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
                sock.on('error', () => {});
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
            case 'ping':    return { ok: true, data: { pong: Date.now() } };
            case 'status':
            case 'stats':   return { ok: true, data: snapshot() };
            case 'shutdown':
                setImmediate(() => shutdown('ipc-shutdown'));
                return { ok: true, data: { shuttingDown: true } };
            default:
                return { ok: false, error: `unknown-cmd: ${cmd ?? '(none)'}` };
        }
    }

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
                        try { sock.write(JSON.stringify(reply) + '\n'); } catch {}
                    }
                });
                sock.on('error', () => {});
            });
            server.once('error', reject);
            server.listen({ port: p2pPort, host: '::', ipv6Only: false }, () => {
                resolve(server);
            });
        });
    }

    const shutdown = async (signal) => {
        if (shuttingDown) return;
        shuttingDown = true;
        process.stdout.write(`\nReceived ${signal}; shutting down...\n`);
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        if (pollTimer) clearInterval(pollTimer);
        try {
            await client.heartbeat({ status: 'offline' });
        } catch (err) {
            process.stderr.write(`offline heartbeat failed: ${err?.message ?? err}\n`);
        }
        if (ipcServer) { try { ipcServer.close(); } catch {} }
        if (p2pServer) { try { p2pServer.close(); } catch {} }
        try { await shutdownEngine(); } catch {}
        removeSocketFile();
        await removePidFile();
        process.stdout.write('bye\n');
        process.exit(0);
    };

    process.on('SIGINT',  () => { shutdown('SIGINT');  });
    process.on('SIGTERM', () => { shutdown('SIGTERM'); });

    try {
        ipcServer = await startIpcServer();
        process.stdout.write(`IPC listening on ${socketPath}\n`);
    } catch (err) {
        process.stderr.write(`Failed to bind IPC socket at ${socketPath}: ${err?.message ?? err}\n`);
    }

    if (!p2pDisabled) {
        try {
            p2pServer = await startP2pServer();
            process.stdout.write(`P2P listening on ${formatEndpoint(advertisedAddress ?? '-', p2pPort)} (dual-stack)\n`);
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
        if (ipcServer) { try { ipcServer.close(); } catch {} }
        if (p2pServer) { try { p2pServer.close(); } catch {} }
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

    await new Promise(() => {});
    return 0;
}

export { HELP };
