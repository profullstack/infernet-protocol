/**
 * TensorDock adapter — IPIP-0019 DeployProvider implementation.
 *
 * TensorDock's marketplace API is REST at
 *   https://marketplace.tensordock.com/api/v0/
 * Auth via api_key + api_token form fields on every request (legacy
 * style — they may add Bearer auth later; check their docs).
 *
 * VM-based (not Docker). createNode launches a VM with an SSH key and a
 * cloud-init payload that runs the Infernet install one-liner; bootstrap
 * polls SSH/health and reports back.
 */

import { DeployProvider, NotSupportedError } from "./base.js";
import { canonicalize, aliasesFor } from "../gpu-normalize.js";
import * as state from "../state.js";

const API_BASE = "https://marketplace.tensordock.com/api/v0";

const DEFAULT_INSTALLER =
    process.env.INFERNET_INSTALLER_URL
    ?? "https://infernetprotocol.com/install.sh";

export class TensorDockProvider extends DeployProvider {
    constructor(config = {}) {
        super({ ...config, providerId: "tensordock" });
        // TensorDock historically uses two credentials — api_key + api_token.
        // Accept either { apiKey, apiToken } or just apiKey for forward
        // compat (newer Bearer-style auth).
        this.apiToken = config.apiToken ?? config.apiKey;
    }

    /** POST a TensorDock REST request as form-encoded body, parse JSON. */
    async _post(path, fields = {}) {
        const body = new URLSearchParams({
            api_key: this.config.apiKey,
            api_token: this.apiToken,
            ...Object.fromEntries(
                Object.entries(fields).map(([k, v]) => [k, typeof v === "object" ? JSON.stringify(v) : String(v)])
            )
        });
        const res = await fetch(`${API_BASE}${path}`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json?.success === false) {
            const msg = json?.error ?? json?.message ?? res.statusText ?? `HTTP ${res.status}`;
            const err = new Error(`TensorDock API error: ${msg}`);
            err.status = res.status;
            err.body = json;
            throw err;
        }
        return json;
    }

    // ---- Discovery ----

    async validateAuth() {
        // /auth/test echoes the user's account if creds are valid.
        const data = await this._post("/auth/test");
        return { ok: true, accountInfo: data };
    }

    async listGpuTypes() {
        // /host/list returns hosts with their available GPU SKUs.
        const data = await this._post("/host/list", { requiresRTX: false });
        const hosts = data?.hostnodes ?? data?.hosts ?? {};
        const seen = new Map();
        for (const h of Object.values(hosts)) {
            const gpus = h?.specs?.gpu ?? {};
            for (const [model, info] of Object.entries(gpus)) {
                if (!seen.has(model)) {
                    seen.set(model, {
                        id: model,
                        name: model,
                        vramGb: info?.vram ?? null,
                        pricePerHour: info?.price ?? null
                    });
                }
            }
        }
        return [...seen.values()];
    }

    async listRegions() {
        const data = await this._post("/host/list");
        const hosts = data?.hostnodes ?? data?.hosts ?? {};
        const regions = new Set();
        for (const h of Object.values(hosts)) {
            const r = h?.location?.country ?? h?.location?.region;
            if (r) regions.add(r);
        }
        return [...regions].map((r) => ({ id: r, name: r }));
    }

    async findOffers(request = {}) {
        const data = await this._post("/host/list");
        const hosts = data?.hostnodes ?? data?.hosts ?? {};

        const wantCanonical = request.gpu ? canonicalize(request.gpu) : null;
        const aliases = wantCanonical
            ? [wantCanonical, ...aliasesFor(wantCanonical)].map((a) => a.toLowerCase())
            : null;

        const offers = [];
        for (const [hostId, h] of Object.entries(hosts)) {
            const gpus = h?.specs?.gpu ?? {};
            for (const [model, info] of Object.entries(gpus)) {
                const modelLower = model.toLowerCase();
                if (aliases && !aliases.some((a) => modelLower.includes(a))) continue;
                if (request.vramMin && info?.vram && info.vram < request.vramMin) continue;
                if (
                    request.maxPricePerHour != null &&
                    info?.price != null &&
                    info.price > request.maxPricePerHour
                ) continue;
                if (info?.amount < (request.gpuCount ?? 1)) continue;

                offers.push({
                    providerId: "tensordock",
                    offerId: `${hostId}:${model}`,
                    gpu: { name: model, count: request.gpuCount ?? 1, vramGb: info?.vram ?? 0 },
                    cpu: h?.specs?.cpu ? { cores: h.specs.cpu.amount, model: h.specs.cpu.type } : undefined,
                    ramGb: h?.specs?.ram?.amount ?? undefined,
                    diskGb: h?.specs?.storage?.amount ?? undefined,
                    region: h?.location?.country ?? h?.location?.region,
                    pricePerHour: info?.price ?? 0,
                    deployStyle: "vm-ssh",
                    available: (info?.amount ?? 0) >= (request.gpuCount ?? 1),
                    raw: { hostId, host: h, gpu: info }
                });
            }
        }
        return offers;
    }

    // ---- Lifecycle ----

    /** Cloud-init payload that runs the Infernet installer + sets env. */
    _buildCloudInit(envMap) {
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
            gpu, gpuCount = 1, name, hostId, region,
            env = {}, controlPlaneUrl = "", engine = "ollama", model = null,
            hourlyPrice = 0, vramGb = 0,
            cpuCores = 4, ramGb = 16, diskSizeGb = 80,
            sshKey, password
        } = request;

        if (!sshKey && !password) {
            throw new Error("tensordock: createNode requires either sshKey or password");
        }

        const finalHostId = hostId ?? await this._pickHost({ gpu, gpuCount, region });
        if (!finalHostId) {
            throw new Error(`tensordock: no host found matching gpu="${gpu}"`);
        }

        const localId = state.generateNodeId();
        const vmName = name ?? localId;

        const data = await this._post("/client/deploy/single", {
            name: vmName,
            location: region ?? "",
            hostnode: finalHostId,
            gpu_model: gpu ?? "",
            gpu_count: gpuCount,
            vcpus: cpuCores,
            ram: ramGb,
            storage: diskSizeGb,
            operating_system: "Ubuntu 22.04 LTS",
            password: password ?? "",
            ssh_key: sshKey ?? "",
            cloudinit_script: this._buildCloudInit({
                INFERNET_NODE_NAME: vmName,
                INFERNET_CONTROL_PLANE_URL: controlPlaneUrl,
                INFERNET_ENGINE: engine,
                ...(model ? { INFERNET_MODEL: model } : {}),
                ...env
            }),
            internal_ports: JSON.stringify([46337]),
            external_ports: JSON.stringify([46337])
        });

        const vmId = data?.deployment ?? data?.id ?? data?.serverID;
        if (!vmId) throw new Error("tensordock: deploy returned no VM id");

        const record = {
            id: localId,
            provider: "tensordock",
            providerNodeId: String(vmId),
            name: vmName,
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

    async _pickHost({ gpu, gpuCount, region }) {
        const offers = await this.findOffers({ gpu, gpuCount, region });
        if (offers.length === 0) return null;
        offers.sort((a, b) => a.pricePerHour - b.pricePerHour);
        return offers[0].raw?.hostId ?? null;
    }

    async waitUntilReady(node, timeoutMs = 5 * 60 * 1000) {
        if (!node?.providerNodeId) {
            throw new Error("tensordock: waitUntilReady requires node.providerNodeId");
        }
        const deadline = Date.now() + timeoutMs;
        const pollInterval = 5000;

        while (Date.now() < deadline) {
            const data = await this._post("/client/get/single", { server: node.providerNodeId });
            const vm = data?.virtualmachine ?? data;
            const status = vm?.status?.toLowerCase();
            const ip = vm?.ip ?? vm?.public_ip;
            if (status === "running" || status === "online") {
                const port = vm?.port_forwards?.find((p) => Number(p.internal) === 46337);
                const externalPort = port?.external ?? 46337;
                const endpointUrl = ip ? `http://${ip}:${externalPort}` : null;
                return state.updateNode(node.id, { status: "running", endpointUrl, ip });
            }
            await new Promise((r) => setTimeout(r, pollInterval));
        }

        await state.updateNode(node.id, {
            status: "error",
            error_log: `vm did not reach RUNNING within ${Math.round(timeoutMs / 1000)}s`
        });
        throw new Error(
            `TensorDock VM ${node.providerNodeId} did not reach RUNNING within ${Math.round(timeoutMs / 1000)}s`
        );
    }

    async bootstrapNode(node, _request) {
        // Cloud-init runs the Infernet installer at boot. Health-check the
        // p2p port to confirm the daemon came up.
        if (!node?.endpointUrl) {
            return { ok: false, reason: "no endpointUrl on node — call waitUntilReady first" };
        }
        const healthEndpoint = `${node.endpointUrl}/health`;
        // Cloud-init takes time after SSH is up; tolerate a few minutes.
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
            } catch (err) {
                lastErr = err?.message ?? String(err);
            }
            await new Promise((r) => setTimeout(r, 10000));
        }
        return { ok: false, reason: lastErr ?? "bootstrap health-check timed out", healthEndpoint };
    }

    async getNode(nodeId) {
        const local = await state.loadNode(nodeId);
        if (!local || local.provider !== "tensordock") {
            throw new Error(`tensordock: no local record for nodeId=${nodeId}`);
        }
        try {
            const data = await this._post("/client/get/single", { server: local.providerNodeId });
            const vm = data?.virtualmachine ?? data;
            if (vm?.status) local.liveStatus = vm.status;
        } catch { /* best-effort */ }
        return local;
    }

    async listNodes() {
        const all = await state.listNodes();
        return all.filter((n) => n.provider === "tensordock");
    }

    async stopNode(nodeId) {
        const local = await state.loadNode(nodeId);
        if (!local || local.provider !== "tensordock") {
            throw new Error(`tensordock: no local record for nodeId=${nodeId}`);
        }
        await this._post("/client/stop/single", { server: local.providerNodeId });
        await state.updateNode(nodeId, { status: "stopped" });
        return { ok: true };
    }

    async startNode(nodeId) {
        const local = await state.loadNode(nodeId);
        if (!local || local.provider !== "tensordock") {
            throw new Error(`tensordock: no local record for nodeId=${nodeId}`);
        }
        await this._post("/client/start/single", { server: local.providerNodeId });
        await state.updateNode(nodeId, { status: "running" });
        return { ok: true };
    }

    async destroyNode(nodeId) {
        const local = await state.loadNode(nodeId);
        if (!local || local.provider !== "tensordock") {
            throw new Error(`tensordock: no local record for nodeId=${nodeId}`);
        }
        await this._post("/client/delete/single", { server: local.providerNodeId });
        await state.updateNode(nodeId, { status: "destroyed" });
        return { ok: true };
    }

    async logs(nodeId, _opts = {}) {
        // TensorDock doesn't expose container/VM logs through the marketplace API.
        // Operators with SSH access can pull /var/log/cloud-init-output.log
        // or `infernet logs` themselves. Throw a helpful message.
        const local = await state.loadNode(nodeId).catch(() => null);
        const dashUrl = "https://dashboard.tensordock.com/";
        const err = new NotSupportedError("logs", "tensordock");
        const sshHint = local?.ip
            ? `\nSSH and run \`infernet logs\`:\n  ssh user@${local.ip} 'tail -200 /var/log/infernet/daemon.log'`
            : "";
        err.message =
            `tensordock: VM logs are not exposed via the marketplace API.\n` +
            `View at: ${dashUrl}` + sshHint;
        throw err;
    }
}

export default TensorDockProvider;
