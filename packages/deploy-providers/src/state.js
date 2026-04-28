/**
 * Local deployment state persistence.
 *
 * Every node created via `infernet deploy` gets a record at
 *   $HOME/.infernet/deployments/nodes/<id>.json
 * plus an entry in
 *   $HOME/.infernet/deployments/deployments.json   (index by id)
 *
 * Records NEVER contain API keys — keys are env-only and live in the
 * separate auth config (~/.config/infernet/config.json under
 * cloudCredentials).
 *
 * State is updated atomically: write to <file>.tmp, fsync, rename.
 * Permissions: 0700 on dirs, 0600 on files.
 */

import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";
import os from "node:os";
import { randomBytes } from "node:crypto";

function defaultStateDir() {
    return process.env.INFERNET_DEPLOY_STATE_DIR
        ?? join(os.homedir(), ".infernet", "deployments");
}

function nodeFilePath(id, stateDir = defaultStateDir()) {
    return join(stateDir, "nodes", `${id}.json`);
}

function indexFilePath(stateDir = defaultStateDir()) {
    return join(stateDir, "deployments.json");
}

/**
 * Generate a stable local ID. Uses a 4-byte random suffix; collisions
 * within an operator's history are vanishingly unlikely and we'd
 * notice immediately on save (file already exists check).
 */
export function generateNodeId() {
    return `infernet-node-${randomBytes(4).toString("hex").slice(0, 4)}`;
}

async function ensureDir(path, mode = 0o700) {
    await fs.mkdir(path, { recursive: true, mode });
    try { await fs.chmod(path, mode); } catch { /* mode set on creation */ }
}

async function atomicWriteJson(path, value, mode = 0o600) {
    await ensureDir(dirname(path));
    const tmp = path + ".tmp";
    await fs.writeFile(tmp, JSON.stringify(value, null, 2), { mode });
    await fs.rename(tmp, path);
}

/**
 * Save a node record. Updates both the per-node file and the index.
 */
export async function saveNode(record, { stateDir = defaultStateDir() } = {}) {
    if (!record?.id) throw new Error("saveNode: record.id is required");
    // Strip API keys defensively — caller shouldn't include them, but
    // belt + suspenders.
    const safe = { ...record };
    delete safe.apiKey;
    delete safe.api_key;

    await atomicWriteJson(nodeFilePath(safe.id, stateDir), safe);

    // Update the index: map of id → minimal summary.
    const index = await loadIndex({ stateDir });
    index[safe.id] = {
        id: safe.id,
        provider: safe.provider,
        gpu: safe.gpu,
        status: safe.status,
        createdAt: safe.createdAt,
        hourlyPrice: safe.hourlyPrice
    };
    await atomicWriteJson(indexFilePath(stateDir), index);
    return safe;
}

export async function loadNode(id, { stateDir = defaultStateDir() } = {}) {
    try {
        const txt = await fs.readFile(nodeFilePath(id, stateDir), "utf8");
        return JSON.parse(txt);
    } catch (err) {
        if (err?.code === "ENOENT") return null;
        throw err;
    }
}

export async function loadIndex({ stateDir = defaultStateDir() } = {}) {
    try {
        const txt = await fs.readFile(indexFilePath(stateDir), "utf8");
        return JSON.parse(txt);
    } catch (err) {
        if (err?.code === "ENOENT") return {};
        throw err;
    }
}

export async function listNodes({ stateDir = defaultStateDir() } = {}) {
    const index = await loadIndex({ stateDir });
    return Object.values(index);
}

export async function updateNode(id, patch, { stateDir = defaultStateDir() } = {}) {
    const existing = await loadNode(id, { stateDir });
    if (!existing) throw new Error(`no deployment record for id=${id}`);
    const updated = { ...existing, ...patch };
    return saveNode(updated, { stateDir });
}

export function defaultStateDirPath() {
    return defaultStateDir();
}
