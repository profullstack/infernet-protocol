/**
 * Vast.ai adapter — rent a GPU instance via the public REST API.
 *
 * Auth: personal API key from https://cloud.vast.ai/manage-keys/.
 * Sent as Bearer token in Authorization header.
 *
 * Vast.ai's model is auction-based: instances are created from "offers"
 * (other operators renting their hardware out). The deploy flow is:
 *   1. Search offers matching the operator's GPU + price preferences.
 *   2. Pick one (cheapest matching by default, or operator-specified).
 *   3. PUT /asks/<offer_id>/ with image + onstart + env vars.
 *
 * Only `createDeployment` is fully wired today — list / destroy follow
 * the same pattern when needed.
 */

const API_BASE = "https://console.vast.ai/api/v0";

async function vastFetch({ apiKey, path, method = "GET", body }) {
    const res = await fetch(`${API_BASE}${path}`, {
        method,
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Accept": "application/json",
            "Content-Type": "application/json"
        },
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await res.text();
    let parsed;
    try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { raw: text }; }
    if (!res.ok) {
        const msg = parsed?.msg ?? parsed?.error ?? `HTTP ${res.status}`;
        const err = new Error(`Vast.ai API error: ${msg}`);
        err.status = res.status;
        err.body = parsed;
        throw err;
    }
    return parsed;
}

export const meta = {
    id: "vast",
    label: "Vast.ai",
    keyUrl: "https://cloud.vast.ai/manage-keys/",
    sizesDoc: "https://docs.vast.ai/instances",
    regionsDoc: "https://docs.vast.ai/search-filters"
};

/**
 * Search offers (GPU rentals available right now). Returns a list of
 * normalized candidate offers.
 *
 * @param {object} args
 * @param {string} args.apiKey
 * @param {string} [args.gpuName]   e.g. "RTX 4090", "A100", "H100"
 * @param {number} [args.numGpus=1]
 * @param {number} [args.maxPrice]  Max $/hr (DLPerf-adjusted)
 * @param {boolean} [args.rentable=true]
 */
export async function searchOffers({
    apiKey,
    gpuName = null,
    numGpus = 1,
    maxPrice = null,
    rentable = true,
    order = "dph_total"  // ascending → cheapest first
}) {
    const q = {
        verified: { "eq": true },
        rentable: { "eq": rentable },
        num_gpus: { "eq": numGpus },
        order: [[order, "asc"]],
        type: "ask"
    };
    if (gpuName) q.gpu_name = { "eq": gpuName };
    if (maxPrice != null) q.dph_total = { "lte": Number(maxPrice) };

    const data = await vastFetch({
        apiKey,
        path: `/bundles/?q=${encodeURIComponent(JSON.stringify(q))}`
    });
    const offers = Array.isArray(data?.offers) ? data.offers : [];
    return offers.map((o) => ({
        id: o.id,
        gpuName: o.gpu_name,
        numGpus: o.num_gpus,
        cpuName: o.cpu_name,
        ramGb: Math.round((o.cpu_ram ?? 0) / 1024),
        diskGb: o.disk_space,
        pricePerHour: o.dph_total,
        region: o.geolocation,
        host: o.machine_id,
        raw: o
    }));
}

/**
 * Create an instance from an offer. user_data goes in onstart so the
 * cloud-init one-liner runs on first boot.
 *
 * @param {object} args
 * @param {string} args.apiKey
 * @param {string} args.offerId   id from searchOffers()
 * @param {string} args.userData  Cloud-init script body (runs as root)
 * @param {string} [args.image="nvidia/cuda:12.4.1-runtime-ubuntu22.04"]
 * @param {number} [args.diskGb=40]
 * @param {string} [args.label="infernet"]
 */
export async function createDeployment({
    apiKey,
    offerId,
    userData,
    image = "nvidia/cuda:12.4.1-runtime-ubuntu22.04",
    diskGb = 40,
    label = "infernet"
}) {
    if (!apiKey) throw new Error("Vast.ai: apiKey required");
    if (!offerId) throw new Error("Vast.ai: offerId required (call searchOffers first)");
    if (!userData) throw new Error("Vast.ai: userData required");

    const body = {
        client_id: "me",
        image,
        env: {},
        disk: diskGb,
        label,
        // onstart is a shell script that runs as root on first boot.
        onstart: userData,
        runtype: "ssh"
    };

    const data = await vastFetch({
        apiKey,
        path: `/asks/${encodeURIComponent(offerId)}/`,
        method: "PUT",
        body
    });

    if (data?.success === false) {
        const err = new Error(`Vast.ai: ${data?.msg ?? "createDeployment failed"}`);
        err.body = data;
        throw err;
    }

    return {
        deploymentId: String(data?.new_contract ?? data?.id ?? ""),
        status: "creating",
        endpoint: null,
        raw: data
    };
}

export async function getDeployment({ apiKey, deploymentId }) {
    const data = await vastFetch({ apiKey, path: `/instances/${deploymentId}/` });
    const inst = data?.instances ?? data;
    return {
        status: inst?.actual_status ?? inst?.cur_state ?? "unknown",
        endpoint: inst?.public_ipaddr ?? null,
        raw: inst
    };
}

export async function destroyDeployment({ apiKey, deploymentId }) {
    await vastFetch({ apiKey, path: `/instances/${deploymentId}/`, method: "DELETE" });
    return { ok: true };
}

// ---- IPIP-0019 DeployProvider class adapter ----

import { DeployProvider, NotSupportedError } from "./providers/base.js";
import { canonicalize, aliasesFor } from "./gpu-normalize.js";
import * as state from "./state.js";

const DEFAULT_INSTALLER =
    process.env.INFERNET_INSTALLER_URL
    ?? "https://infernetprotocol.com/install.sh";

export class VastProvider extends DeployProvider {
    constructor(config = {}) {
        super({ ...config, providerId: "vast" });
    }

    async _fetch(path, { method = "GET", body } = {}) {
        return vastFetch({ apiKey: this.config.apiKey, path, method, body });
    }

    async validateAuth() {
        const data = await this._fetch("/users/current/");
        if (!data?.id && !data?.email) throw new Error("Vast.ai: API key invalid");
        return { ok: true, accountInfo: { id: data.id, email: data.email } };
    }

    async listGpuTypes() {
        // Vast doesn't have a closed GPU catalog — derive from current offers.
        const offers = await searchOffers({ apiKey: this.config.apiKey, rentable: true });
        const seen = new Map();
        for (const o of offers) {
            if (!seen.has(o.gpuName)) {
                seen.set(o.gpuName, { id: o.gpuName, name: o.gpuName, vramGb: null, pricePerHour: o.pricePerHour });
            }
        }
        return [...seen.values()];
    }

    async listRegions() {
        const offers = await searchOffers({ apiKey: this.config.apiKey, rentable: true });
        const regions = new Set();
        for (const o of offers) if (o.region) regions.add(o.region);
        return [...regions].map((r) => ({ id: r, name: r }));
    }

    async findOffers(request = {}) {
        const wantCanonical = request.gpu ? canonicalize(request.gpu) : null;
        // Vast's gpu_name filter wants a specific string; we'll loosely
        // match by querying broadly and filtering client-side.
        const raw = await searchOffers({
            apiKey: this.config.apiKey,
            numGpus: request.gpuCount ?? 1,
            maxPrice: request.maxPricePerHour ?? null,
            rentable: true
        });
        const aliases = wantCanonical
            ? [wantCanonical, ...aliasesFor(wantCanonical)].map((a) => a.toLowerCase())
            : null;

        const offers = [];
        for (const o of raw) {
            const nameLower = (o.gpuName ?? "").toLowerCase();
            if (aliases && !aliases.some((a) => nameLower.includes(a))) continue;
            if (request.region && o.region !== request.region) continue;
            offers.push({
                providerId: "vast",
                offerId: String(o.id),
                gpu: { name: o.gpuName, count: o.numGpus, vramGb: 0 },
                cpu: o.cpuName ? { cores: undefined, model: o.cpuName } : undefined,
                ramGb: o.ramGb,
                diskGb: o.diskGb,
                region: o.region,
                pricePerHour: o.pricePerHour,
                deployStyle: "docker",
                available: true,
                raw: o
            });
        }
        return offers;
    }

    _buildOnstart(envMap) {
        const exports = Object.entries(envMap)
            .map(([k, v]) => `export ${k}=${JSON.stringify(String(v))}`)
            .join("\n");
        return [
            "#!/bin/bash",
            "set -eux",
            exports,
            `curl -fsSL ${DEFAULT_INSTALLER} | bash`,
            "infernet register || true",
            "infernet start || true"
        ].join("\n");
    }

    async createNode(request = {}) {
        const {
            offerId, name, image = "nvidia/cuda:12.4.1-runtime-ubuntu22.04",
            diskSizeGb = 40, env = {}, controlPlaneUrl = "",
            engine = "ollama", model = null, hourlyPrice = 0, vramGb = 0,
            gpu, gpuCount = 1, region
        } = request;

        if (!offerId) {
            throw new Error("vast: createNode requires offerId (call findOffers first)");
        }

        const localId = state.generateNodeId();
        const label = name ?? localId;

        const onstart = this._buildOnstart({
            INFERNET_NODE_NAME: label,
            INFERNET_CONTROL_PLANE_URL: controlPlaneUrl,
            INFERNET_ENGINE: engine,
            ...(model ? { INFERNET_MODEL: model } : {}),
            ...env
        });

        const result = await createDeployment({
            apiKey: this.config.apiKey,
            offerId, userData: onstart, image, diskGb: diskSizeGb, label
        });

        const record = {
            id: localId,
            provider: "vast",
            providerNodeId: result.deploymentId,
            name: label,
            gpu: gpu ?? "",
            gpuCount,
            vramGb,
            region,
            hourlyPrice,
            engine,
            model: model ?? undefined,
            status: "creating",
            createdAt: new Date().toISOString(),
            controlPlaneUrl
        };
        await state.saveNode(record);
        return record;
    }

    async waitUntilReady(node, timeoutMs = 5 * 60 * 1000) {
        if (!node?.providerNodeId) throw new Error("vast: waitUntilReady requires node.providerNodeId");
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const live = await getDeployment({ apiKey: this.config.apiKey, deploymentId: node.providerNodeId });
            const s = (live?.status ?? "").toLowerCase();
            if (s === "running" && live?.endpoint) {
                const endpointUrl = `http://${live.endpoint}:46337`;
                return state.updateNode(node.id, { status: "running", endpointUrl, ip: live.endpoint });
            }
            await new Promise((r) => setTimeout(r, 5000));
        }
        await state.updateNode(node.id, { status: "error", error_log: "vast instance did not reach RUNNING in time" });
        throw new Error(`Vast.ai instance ${node.providerNodeId} did not reach RUNNING within ${Math.round(timeoutMs / 1000)}s`);
    }

    async bootstrapNode(node, _request) {
        // onstart already ran the installer; just health-check.
        if (!node?.endpointUrl) return { ok: false, reason: "no endpointUrl on node" };
        const healthEndpoint = `${node.endpointUrl}/health`;
        const deadline = Date.now() + 5 * 60 * 1000;
        let lastErr = null;
        while (Date.now() < deadline) {
            try {
                const ctrl = new AbortController();
                const t = setTimeout(() => ctrl.abort(), 5000);
                const res = await fetch(healthEndpoint, { signal: ctrl.signal });
                clearTimeout(t);
                if (res.ok) return { ok: true, healthEndpoint };
                lastErr = `HTTP ${res.status}`;
            } catch (err) { lastErr = err?.message ?? String(err); }
            await new Promise((r) => setTimeout(r, 10000));
        }
        return { ok: false, reason: lastErr ?? "bootstrap health-check timed out", healthEndpoint };
    }

    async getNode(nodeId) {
        const local = await state.loadNode(nodeId);
        if (!local || local.provider !== "vast") {
            throw new Error(`vast: no local record for nodeId=${nodeId}`);
        }
        try {
            const live = await getDeployment({ apiKey: this.config.apiKey, deploymentId: local.providerNodeId });
            if (live?.status) local.liveStatus = live.status;
        } catch { /* best-effort */ }
        return local;
    }

    async listNodes() {
        const all = await state.listNodes();
        return all.filter((n) => n.provider === "vast");
    }

    async stopNode(nodeId) {
        const local = await state.loadNode(nodeId);
        if (!local || local.provider !== "vast") throw new Error(`vast: no local record for nodeId=${nodeId}`);
        // Vast.ai pauses instances via state=stopped action.
        await this._fetch(`/instances/${local.providerNodeId}/`, { method: "PUT", body: { state: "stopped" } });
        await state.updateNode(nodeId, { status: "stopped" });
        return { ok: true };
    }

    async startNode(nodeId) {
        const local = await state.loadNode(nodeId);
        if (!local || local.provider !== "vast") throw new Error(`vast: no local record for nodeId=${nodeId}`);
        await this._fetch(`/instances/${local.providerNodeId}/`, { method: "PUT", body: { state: "running" } });
        await state.updateNode(nodeId, { status: "running" });
        return { ok: true };
    }

    async destroyNode(nodeId) {
        const local = await state.loadNode(nodeId);
        if (!local || local.provider !== "vast") throw new Error(`vast: no local record for nodeId=${nodeId}`);
        await destroyDeployment({ apiKey: this.config.apiKey, deploymentId: local.providerNodeId });
        await state.updateNode(nodeId, { status: "destroyed" });
        return { ok: true };
    }

    async logs(nodeId, _opts = {}) {
        const local = await state.loadNode(nodeId).catch(() => null);
        const url = local?.providerNodeId
            ? `https://cloud.vast.ai/instances/?id=${local.providerNodeId}`
            : "https://cloud.vast.ai/instances/";
        const err = new NotSupportedError("logs", "vast");
        const sshHint = local?.ip
            ? `\nSSH and tail the daemon log:\n  ssh root@${local.ip} 'tail -200 /var/log/infernet/daemon.log'`
            : "";
        err.message = `vast: container logs are not exposed via the public API.\nView at: ${url}` + sshHint;
        throw err;
    }
}

export default VastProvider;
