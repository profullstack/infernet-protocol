/**
 * vLLM serve manager — turns ON the vLLM backend the installer already put on
 * the box (venv → `$INFERNET_BIN/vllm`) but that nothing ever started.
 *
 * vLLM serves ONE model per GPU process on an OpenAI-compatible API (:8000),
 * so we run a single model at a time; installing a new `hf:` model replaces
 * the current one. We track the process in a state file and advertise the
 * served model (by its `hf:` pull name via `--served-model-name`) so it lands
 * in `served_models` → shows in /chat, and the engine auto-selects vLLM over
 * Ollama (per createEngine's precedence) once /v1/models answers.
 *
 * Everything here is best-effort + feature-detected: if vLLM isn't installed
 * or a serve fails, callers fall back to Ollama — the working path is never
 * broken.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import { getConfigDir } from './config.js';
import { isPidAlive } from './inference/state.js';

export const VLLM_PORT = Number(process.env.VLLM_PORT) || 8000;
export const VLLM_HOST = process.env.VLLM_HOST || `http://localhost:${VLLM_PORT}`;

function statePath() {
    return path.join(getConfigDir(), 'vllm.json');
}

function logPath() {
    return path.join(getConfigDir(), 'vllm.log');
}

/** Locate the vllm binary the installer symlinked (or a venv/PATH copy). */
export function resolveVllmBin() {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    const candidates = [
        process.env.VLLM_BIN,
        path.join(home, '.local/bin/vllm'),
        path.join(home, '.infernet/vllm-venv/bin/vllm'),
    ].filter(Boolean);
    for (const c of candidates) {
        try {
            if (fss.existsSync(c) && (fss.statSync(c).mode & 0o111)) return c;
        } catch { /* keep looking */ }
    }
    return null; // not installed
}

export function vllmInstalled() {
    return resolveVllmBin() !== null;
}

export async function readVllmState() {
    try {
        return JSON.parse(await fs.readFile(statePath(), 'utf8'));
    } catch {
        return null;
    }
}

async function writeVllmState(state) {
    await fs.mkdir(getConfigDir(), { recursive: true, mode: 0o700 });
    await fs.writeFile(statePath(), JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
}

async function clearVllmState() {
    try { await fs.rm(statePath()); } catch { /* already gone */ }
}

/** GET /v1/models — the model(s) vLLM is currently serving (empty if down). */
export async function detectVllmModels(host = VLLM_HOST, timeoutMs = 1500) {
    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), timeoutMs);
        const res = await fetch(new URL('/v1/models', host), { signal: ctrl.signal });
        clearTimeout(t);
        if (!res.ok) return [];
        const body = await res.json();
        return (body?.data ?? []).map((m) => m.id).filter((id) => typeof id === 'string');
    } catch {
        return [];
    }
}

/** True when the tracked serve pid is alive AND /v1/models answers. */
export async function isVllmServing() {
    const st = await readVllmState();
    if (st?.pid && !isPidAlive(st.pid)) return false;
    return (await detectVllmModels()).length > 0;
}

/** Stop the tracked vLLM serve process (best-effort). */
export async function stopVllmServe() {
    const st = await readVllmState();
    if (st?.pid && isPidAlive(st.pid)) {
        try { process.kill(st.pid, 'SIGTERM'); } catch { /* already dead */ }
    }
    await clearVllmState();
}

/**
 * Start `vllm serve` for a model. `servedName` is what clients/heartbeat use
 * (the `hf:org/repo` pull name) so the advertised model matches chat requests.
 * `source` is the local weights dir (preferred) or the repo id vLLM fetches.
 * Only one model runs at a time — replaces any current serve.
 */
export async function startVllmServe({ source, servedName, port = VLLM_PORT, token = null, extraArgs = [] }) {
    const bin = resolveVllmBin();
    if (!bin) {
        throw new Error(
            'vLLM is not installed on this node (no vllm binary in ~/.local/bin or vllm-venv). ' +
            'Re-run the installer on an NVIDIA host, or: pip install vllm.'
        );
    }
    await stopVllmServe().catch(() => {});

    const args = ['serve', source, '--host', '0.0.0.0', '--port', String(port)];
    if (servedName) args.push('--served-model-name', servedName);
    args.push(...extraArgs);

    const env = { ...process.env };
    if (token) env.HF_TOKEN = token;

    await fs.mkdir(getConfigDir(), { recursive: true, mode: 0o700 });
    const out = fss.openSync(logPath(), 'a');
    const child = spawn(bin, args, { detached: true, stdio: ['ignore', out, out], env });
    child.unref();

    await writeVllmState({
        pid: child.pid,
        model: servedName ?? source,
        source,
        port,
        startedAt: new Date().toISOString(),
        log: logPath(),
    });
    return { pid: child.pid, port, model: servedName ?? source, log: logPath() };
}
