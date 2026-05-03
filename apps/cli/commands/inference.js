/**
 * `infernet inference` — distributed-inference serving.
 *
 * Two backends today:
 *
 *   --backend rpc     — IPIP-0033, the active path. Spawns
 *                       llama.cpp's `rpc-server`, advertises the slot
 *                       in heartbeat as specs.rpc.{models, host, port},
 *                       lets primaries dial in via /v1/rpc/inference.
 *
 *   --backend petals  — IPIP-0031, Replaced. Kept for one release for
 *                       daemons mid-migration. Spawns Python Petals
 *                       and joins the (effectively empty) public DHT
 *                       swarm. New users should pick rpc.
 *
 * Plus a primary role:
 *
 *   infernet inference primary --model <id> --gguf <path>
 *       Marks this node as a candidate primary for `model`. The
 *       primary holds the GGUF locally; on /v1/rpc/inference it
 *       spawns llama-server with --rpc <slice list> from the control
 *       plane. No long-running child here — the daemon's HTTP
 *       handler runs the actual binary per request.
 */

import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { loadConfig } from '../lib/config.js';
import { startPetalsServer } from '../lib/inference/petals-engine.js';
import {
    readInferenceState,
    patchInferenceState,
    isPidAlive
} from '../lib/inference/state.js';

const HELP = `infernet inference — distributed inference serving

Usage:
  infernet inference serve --backend rpc --model <id> [flags]      (IPIP-0033)
  infernet inference serve --backend petals --model <hf-id> [flags](IPIP-0031, deprecated)
  infernet inference primary --model <id> --gguf <path> [flags]    (IPIP-0033)
  infernet inference status
  infernet inference stop [--backend rpc|petals]
  infernet inference list

Flags (serve --backend rpc):
  --model <id>             Required. Canonical model id (e.g. qwen2.5:72b).
  --port <n>               rpc-server port (default: 50052).
  --host <addr>            Bind interface (default: 0.0.0.0).
  --binary <path>          rpc-server binary (default: rpc-server in PATH).
  --vram-gb <n>            VRAM offered to RPC clients (advertised in heartbeat).
  --ram-gb <n>             RAM offered to RPC clients.
  --max-concurrent <n>     Max simultaneous RPC clients (default: 1).

Flags (primary):
  --model <id>             Canonical model id.
  --gguf <path>            Absolute path to the GGUF file the primary holds.

Flags (serve --backend petals — DEPRECATED):
  --model <hf-id>          e.g. meta-llama/Llama-3.1-70B-Instruct
  --num-blocks <n>         Transformer blocks to host (auto if omitted).
  --port <n>               Petals server port (default: 31330).
  --dht-prefix <str>       DHT prefix (default: /petals/v3-public).

Examples:
  # Slice an RPC server for any primaries hosting Qwen 2.5 72B
  infernet inference serve --backend rpc --model qwen2.5:72b --port 50052

  # Register this node as a primary holding the GGUF locally
  infernet inference primary --model qwen2.5:72b --gguf ~/models/qwen-72b.gguf

What happens next:
  Re-register so the control plane sees specs.rpc / specs.rpc_primary:
    infernet register
  Or just keep the daemon running — heartbeats pick up state changes
  on the next tick.
`;

async function pythonHasPetals() {
    return new Promise((resolve) => {
        const p = spawn('python3', ['-c', 'import petals'], { stdio: 'ignore' });
        p.on('exit', (code) => resolve(code === 0));
        p.on('error', () => resolve(false));
    });
}

// ---- IPIP-0033: serve --backend rpc -----------------------------------------

async function cmdServeRpc(args) {
    const model = args.get('model');
    if (!model) {
        process.stderr.write('error: --model <id> is required\n');
        return 2;
    }
    const port = Number.parseInt(args.get('port') ?? '50052', 10);
    const host = args.get('host') ?? '0.0.0.0';
    const binary = args.get('binary') ?? 'rpc-server';
    const vramGb = args.get('vram-gb') ? Number(args.get('vram-gb')) : null;
    const ramGb = args.get('ram-gb') ? Number(args.get('ram-gb')) : null;
    const maxConcurrent = args.get('max-concurrent')
        ? Number.parseInt(args.get('max-concurrent'), 10)
        : 1;

    process.stdout.write(`Starting llama.cpp rpc-server for ${model} on ${host}:${port}…\n`);

    let child;
    try {
        child = spawn(binary, ['-H', host, '-p', String(port)], {
            stdio: ['ignore', 'inherit', 'inherit']
        });
    } catch (err) {
        process.stderr.write(`error: failed to spawn ${binary}: ${err?.message ?? err}\n`);
        return 1;
    }
    if (!child?.pid) {
        process.stderr.write(`error: ${binary} did not start (binary missing? install llama.cpp)\n`);
        return 1;
    }

    // Persist into state so the daemon's heartbeat advertises this slot.
    // Multiple `infernet inference serve --backend rpc` invocations on
    // the same daemon merge into a single rpc_slice block — the heartbeat
    // path always reflects the most recent invocation.
    await patchInferenceState((s) => {
        const prev = s.rpc_slice ?? {};
        const models = new Set([...(prev.models ?? []), model]);
        return {
            ...s,
            rpc_slice: {
                models: [...models],
                host,
                port,
                pid: child.pid,
                binary,
                vram_gb: vramGb ?? prev.vram_gb ?? null,
                ram_gb: ramGb ?? prev.ram_gb ?? null,
                max_concurrent: maxConcurrent,
                started_at: new Date().toISOString()
            }
        };
    });

    process.stdout.write(
        `\n✓ rpc-server pid=${child.pid} started.\n` +
        `   Heartbeat will advertise this slot as specs.rpc — re-run\n` +
        `   \`infernet register\` if you don't want to wait for the next tick.\n\n` +
        `   Stop with: infernet inference stop --backend rpc\n`
    );

    process.on('SIGINT', () => { try { child.kill('SIGTERM'); } catch { /* ignore */ } });

    return new Promise((resolve) => {
        child.on('exit', async (code) => {
            await patchInferenceState((s) => {
                if (s.rpc_slice?.pid === child.pid) {
                    return {
                        ...s,
                        rpc_slice: {
                            ...s.rpc_slice,
                            pid: null,
                            exited_at: new Date().toISOString(),
                            exited_with: code
                        }
                    };
                }
                return s;
            });
            resolve(code === 0 ? 0 : 1);
        });
    });
}

// ---- IPIP-0033: primary -----------------------------------------------------

async function cmdPrimary(args) {
    const model = args.get('model');
    const ggufPath = args.get('gguf');
    if (!model || !ggufPath) {
        process.stderr.write('error: --model <id> and --gguf <path> are both required\n');
        return 2;
    }
    const absPath = path.isAbsolute(ggufPath) ? ggufPath : path.resolve(process.cwd(), ggufPath);
    try {
        await fsp.access(absPath, fsp.constants.R_OK);
    } catch {
        process.stderr.write(`error: gguf not readable at ${absPath}\n`);
        return 1;
    }

    await patchInferenceState((s) => {
        const prev = s.rpc_primary ?? {};
        const models = new Set([...(prev.models ?? []), model]);
        const ggufPaths = { ...(prev.gguf_paths ?? {}), [model]: absPath };
        return {
            ...s,
            rpc_primary: {
                models: [...models],
                gguf_paths: ggufPaths,
                updated_at: new Date().toISOString()
            }
        };
    });

    // Also seed the canonical lookup the /v1/rpc/inference handler
    // expects: ~/.infernet/models/<id>.gguf as a symlink. Best effort —
    // the handler accepts an absolute path too, so this is convenience
    // only.
    try {
        const modelsDir = path.join(os.homedir(), '.infernet', 'models');
        await fsp.mkdir(modelsDir, { recursive: true });
        const link = path.join(modelsDir, `${model}.gguf`);
        try { await fsp.unlink(link); } catch { /* ignore */ }
        await fsp.symlink(absPath, link);
    } catch (err) {
        process.stderr.write(`warn: could not create symlink (${err?.message ?? err})\n`);
    }

    process.stdout.write(
        `✓ Registered as RPC primary for ${model}.\n` +
        `   GGUF:     ${absPath}\n` +
        `   Heartbeat will advertise specs.rpc_primary.\n` +
        `   Run \`infernet register\` to push the change immediately.\n`
    );
    return 0;
}

// ---- IPIP-0031: petals (deprecated) -----------------------------------------

async function cmdServePetals(args) {
    const model = args.get('model');
    if (!model) {
        process.stderr.write('error: --model <hf-id> is required\n');
        return 2;
    }
    const numBlocks = args.get('num-blocks') ? Number.parseInt(args.get('num-blocks'), 10) : null;
    const port = Number.parseInt(args.get('port') ?? '31330', 10);
    const prefix = args.get('dht-prefix') ?? '/petals/v3-public';

    if (!(await pythonHasPetals())) {
        process.stderr.write(
            'error: petals isn\'t installed. Run:\n  pip install -U petals\n' +
            '  python3 -c \'import petals\'   # verify\n'
        );
        return 1;
    }

    process.stdout.write(`[deprecated] Petals backend is being phased out — see IPIP-0033.\n`);
    process.stdout.write(`Starting Petals server for ${model} on :${port} (${numBlocks ?? 'auto'} blocks)…\n`);

    const child = startPetalsServer({ model, numBlocks, port, prefix });
    if (!child?.pid) {
        process.stderr.write('error: failed to spawn petals server\n');
        return 1;
    }

    await patchInferenceState((s) => ({
        ...s,
        petals: {
            backend: 'petals',
            model,
            port,
            prefix,
            num_blocks: numBlocks,
            pid: child.pid,
            started_at: new Date().toISOString(),
            peer_id: null
        }
    }));

    const tapForPeerId = (stream, sink) => {
        let buf = '';
        stream.on('data', async (chunk) => {
            const txt = chunk.toString();
            sink.write(txt);
            buf += txt;
            const m = buf.match(/peer ID[:\s]+([1-9A-HJ-NP-Za-km-z]{40,80})/i);
            if (m) {
                await patchInferenceState((s) => {
                    if (s.petals && !s.petals.peer_id) {
                        return { ...s, petals: { ...s.petals, peer_id: m[1] } };
                    }
                    return s;
                });
                process.stdout.write(`[infernet] captured petals peer id: ${m[1]}\n`);
                buf = '';
            }
            if (buf.length > 4096) buf = buf.slice(-2048);
        });
    };
    if (child.stdout) tapForPeerId(child.stdout, process.stdout);
    if (child.stderr) tapForPeerId(child.stderr, process.stderr);

    process.on('SIGINT', () => { try { child.kill('SIGTERM'); } catch { /* ignore */ } });
    return new Promise((resolve) => {
        child.on('exit', async (code) => {
            await patchInferenceState((s) => ({
                ...s,
                petals: {
                    ...(s.petals ?? {}),
                    pid: null,
                    exited_with: code,
                    exited_at: new Date().toISOString()
                }
            }));
            resolve(code === 0 ? 0 : 1);
        });
    });
}

async function cmdServe(args) {
    const backend = (args.get('backend') ?? 'rpc').toLowerCase();
    if (backend === 'rpc') return cmdServeRpc(args);
    if (backend === 'petals') return cmdServePetals(args);
    process.stderr.write(`error: unknown --backend ${backend} (use rpc or petals)\n`);
    return 2;
}

// ---- status / stop / list ---------------------------------------------------

async function cmdStatus() {
    const state = await readInferenceState();
    if (!state || Object.keys(state).length === 0) {
        process.stdout.write('(no inference roles configured)\n');
        return 0;
    }

    if (state.rpc_slice) {
        const s = state.rpc_slice;
        process.stdout.write(`rpc-slice:\n`);
        process.stdout.write(`  models:    ${(s.models ?? []).join(', ')}\n`);
        process.stdout.write(`  endpoint:  ${s.host}:${s.port}\n`);
        process.stdout.write(`  pid:       ${s.pid ?? '(exited)'}\n`);
        if (s.pid) process.stdout.write(`  alive:     ${isPidAlive(s.pid) ? 'yes' : 'no — pid stale'}\n`);
        if (s.exited_at) process.stdout.write(`  exited:    ${s.exited_at} (code ${s.exited_with})\n`);
    }
    if (state.rpc_primary) {
        const p = state.rpc_primary;
        process.stdout.write(`rpc-primary:\n`);
        process.stdout.write(`  models:    ${(p.models ?? []).join(', ')}\n`);
        for (const [m, gguf] of Object.entries(p.gguf_paths ?? {})) {
            process.stdout.write(`    ${m} → ${gguf}\n`);
        }
    }
    if (state.petals) {
        const p = state.petals;
        process.stdout.write(`petals (deprecated):\n`);
        process.stdout.write(`  model:     ${p.model}\n`);
        process.stdout.write(`  port:      ${p.port}\n`);
        process.stdout.write(`  pid:       ${p.pid ?? '(exited)'}\n`);
        if (p.pid) process.stdout.write(`  alive:     ${isPidAlive(p.pid) ? 'yes' : 'no — pid stale'}\n`);
        if (p.peer_id) process.stdout.write(`  peer_id:   ${p.peer_id}\n`);
    }
    return 0;
}

async function cmdStop(args) {
    const which = args.get('backend');
    const state = await readInferenceState();
    let killed = 0;

    if ((!which || which === 'rpc') && state.rpc_slice?.pid) {
        try {
            process.kill(state.rpc_slice.pid, 'SIGTERM');
            process.stdout.write(`SIGTERM → rpc-slice pid ${state.rpc_slice.pid}\n`);
            killed += 1;
        } catch (err) {
            process.stderr.write(`could not kill rpc-slice pid ${state.rpc_slice.pid}: ${err?.message ?? err}\n`);
        }
    }
    if ((!which || which === 'petals') && state.petals?.pid) {
        try {
            process.kill(state.petals.pid, 'SIGTERM');
            process.stdout.write(`SIGTERM → petals pid ${state.petals.pid}\n`);
            killed += 1;
        } catch (err) {
            process.stderr.write(`could not kill petals pid ${state.petals.pid}: ${err?.message ?? err}\n`);
        }
    }

    if (killed === 0) process.stdout.write('(nothing to stop)\n');
    return 0;
}

async function cmdList() {
    const cfg = await loadConfig().catch(() => ({}));
    const controlPlaneUrl = cfg?.controlPlane?.url ?? process.env.NEXT_PUBLIC_APP_URL ?? 'https://infernetprotocol.com';
    const res = await fetch(`${controlPlaneUrl}/api/v1/petals/swarm`);
    if (!res.ok) {
        process.stderr.write(`error: HTTP ${res.status} from ${controlPlaneUrl}\n`);
        return 1;
    }
    const { data } = await res.json();
    if (!data?.models?.length) {
        process.stdout.write(`(no swarms active right now)\n`);
        process.stdout.write(`Be the first — \`infernet inference serve --backend rpc --model <id>\`\n`);
        return 0;
    }
    process.stdout.write(`\nSwarms — ${data.total_models} models · ${data.total_nodes} nodes\n\n`);
    for (const m of data.models) {
        process.stdout.write(`  ${String(m.node_count).padEnd(5)} ${m.model}\n`);
    }
    return 0;
}

export default async function inference(args) {
    if (args.has('help') || args.has('h')) {
        process.stdout.write(HELP);
        return 0;
    }
    const sub = args.positional?.[0];
    switch (sub) {
        case 'serve': case 'start':  return cmdServe(args);
        case 'primary':              return cmdPrimary(args);
        case 'status':               return cmdStatus();
        case 'stop':                 return cmdStop(args);
        case 'list': case 'ls':      return cmdList();
        default:
            process.stderr.write(sub ? `unknown subcommand: ${sub}\n\n` : 'error: missing subcommand\n\n');
            process.stderr.write(HELP);
            return 2;
    }
}

export { HELP };
