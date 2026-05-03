/**
 * `infernet inference` — federated inference serving via llama.cpp RPC.
 *
 * IPIP-0033 is the active and only path. Two roles:
 *
 *   slice — `infernet inference serve --backend rpc --model <id>`
 *           Spawns llama.cpp's `rpc-server`, advertises specs.rpc.{models,
 *           host, port} on heartbeat, lets primaries dial in via
 *           /v1/rpc/inference.
 *
 *   primary — `infernet inference primary --model <id> --gguf <path>`
 *             Records the model→GGUF mapping. The daemon's
 *             /v1/rpc/inference handler spawns llama-server with the
 *             control plane's --rpc slice list per request.
 *
 * The Petals path (IPIP-0031, Replaced) was removed. Daemons that
 * relied on it have been migrated.
 */

import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import {
    readInferenceState,
    patchInferenceState,
    isPidAlive
} from '../lib/inference/state.js';

const HELP = `infernet inference — federated inference serving (IPIP-0033)

Usage:
  infernet inference serve --backend rpc --model <id> [flags]
  infernet inference primary --model <id> --gguf <path>
  infernet inference status
  infernet inference stop

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

Examples:
  # Slice an RPC server for any primary hosting Qwen 2.5 72B
  infernet inference serve --backend rpc --model qwen2.5:72b --port 50052

  # Register this node as a primary holding the GGUF locally
  infernet inference primary --model qwen2.5:72b --gguf ~/models/qwen-72b.gguf

What happens next:
  Re-register so the control plane sees specs.rpc / specs.rpc_primary:
    infernet register
  Or just keep the daemon running — heartbeats pick up state changes
  on the next tick.
`;

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
        `   Stop with: infernet inference stop\n`
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

    // Convenience symlink at ~/.infernet/models/<id>.gguf so the
    // /v1/rpc/inference handler can resolve either the absolute path
    // from state OR this symlink, whichever exists.
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

async function cmdServe(args) {
    const backend = (args.get('backend') ?? 'rpc').toLowerCase();
    if (backend === 'rpc') return cmdServeRpc(args);
    process.stderr.write(
        `error: --backend ${backend} is not supported. Use --backend rpc (IPIP-0033).\n` +
        `       The legacy Petals backend was removed.\n`
    );
    return 2;
}

// ---- status / stop ----------------------------------------------------------

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
    return 0;
}

async function cmdStop() {
    const state = await readInferenceState();
    if (!state.rpc_slice?.pid) {
        process.stdout.write('(nothing to stop)\n');
        return 0;
    }
    try {
        process.kill(state.rpc_slice.pid, 'SIGTERM');
        process.stdout.write(`SIGTERM → rpc-slice pid ${state.rpc_slice.pid}\n`);
    } catch (err) {
        process.stderr.write(`could not kill rpc-slice pid ${state.rpc_slice.pid}: ${err?.message ?? err}\n`);
        return 1;
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
        case 'stop':                 return cmdStop();
        default:
            process.stderr.write(sub ? `unknown subcommand: ${sub}\n\n` : 'error: missing subcommand\n\n');
            process.stderr.write(HELP);
            return 2;
    }
}

export { HELP };
