/**
 * Shared `~/.infernet/inference/state.json` reader/writer. The file
 * is the single source of truth between `infernet inference …`
 * subcommands and the long-running daemon (which reads it on every
 * heartbeat to assemble specs.rpc / specs.rpc_primary).
 *
 * Shape (all fields optional — the daemon assembles only what's
 * present):
 *
 *   {
 *     "rpc_slice": { models: [...], host, port, pid, started_at,
 *                    binary, gpu, vram_gb, ram_gb, max_concurrent },
 *     "rpc_primary": { models: [...], gguf_paths: { <model_id>: <path> },
 *                      version }
 *   }
 *
 * Atomic writes via temp-file rename so concurrent subcommands +
 * daemon heartbeats can't see a torn file. Reads tolerate a missing
 * file (returns {}).
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const STATE_DIR = path.join(process.env.HOME ?? '/tmp', '.infernet', 'inference');
const STATE_FILE = path.join(STATE_DIR, 'state.json');

export function inferenceStateDir() { return STATE_DIR; }
export function inferenceStateFile() { return STATE_FILE; }

export async function readInferenceState() {
    try {
        const raw = await fsp.readFile(STATE_FILE, 'utf8');
        const obj = JSON.parse(raw);
        return obj && typeof obj === 'object' ? obj : {};
    } catch { return {}; }
}

export function readInferenceStateSync() {
    try {
        const raw = fs.readFileSync(STATE_FILE, 'utf8');
        const obj = JSON.parse(raw);
        return obj && typeof obj === 'object' ? obj : {};
    } catch { return {}; }
}

export async function writeInferenceState(next) {
    await fsp.mkdir(STATE_DIR, { recursive: true });
    const tmp = `${STATE_FILE}.${process.pid}.${Date.now()}`;
    await fsp.writeFile(tmp, JSON.stringify(next, null, 2));
    await fsp.rename(tmp, STATE_FILE);
}

/**
 * Read-modify-write helper. The mutator can be sync or async; it
 * receives the current state (always an object) and returns the
 * next state.
 */
export async function patchInferenceState(mutator) {
    const cur = await readInferenceState();
    const next = await mutator({ ...cur });
    await writeInferenceState(next);
    return next;
}

/**
 * True if `pid` is a live process. `process.kill(pid, 0)` throws
 * ESRCH for dead pids and EPERM for foreign processes — we treat
 * EPERM as "alive but not ours" (unusual but possible after a uid
 * change). Anything else → dead.
 */
export function isPidAlive(pid) {
    if (!Number.isFinite(pid) || pid <= 0) return false;
    try {
        process.kill(pid, 0);
        return true;
    } catch (err) {
        return err?.code === 'EPERM';
    }
}
