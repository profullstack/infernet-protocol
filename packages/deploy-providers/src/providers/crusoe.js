/**
 * Crusoe Cloud adapter — IPIP-0019 DeployProvider implementation.
 *
 * REST API: https://api.crusoecloud.site/v1alpha5/
 * Docs:     https://docs.crusoecloud.com/api/
 * Auth:     Bearer token from https://console.crusoecloud.com/security/tokens
 *
 * Crusoe scopes resources by project — pass `projectId` in the config or
 * set CRUSOE_PROJECT_ID env var. Cloud-init via the `startup_script` field
 * on POST /projects/{project_id}/compute/instances.
 *
 * Verified against current docs: 2026-05-01.
 */

import { DeployProvider, NotSupportedError } from "./base.js";
import { canonicalize, aliasesFor } from "../gpu-normalize.js";
import * as state from "../state.js";
import { composeInstallScript, pollVllmHealth } from "../vllm-bootstrap.js";

const API_BASE = "https://api.crusoecloud.site/v1alpha5";
const DEFAULT_INSTALLER = process.env.INFERNET_INSTALLER_URL ?? "https://infernetprotocol.com/install.sh";

export class CrusoeProvider extends DeployProvider {
    constructor(config = {}) {
        super({ ...config, providerId: "crusoe" });
        this.projectId = config.projectId ?? process.env.CRUSOE_PROJECT_ID;
    }

    _project(path = "") {
        if (!this.projectId) throw new Error("crusoe: projectId required (config.projectId or CRUSOE_PROJECT_ID)");
        return `/projects/${this.projectId}${path}`;
    }

    async _request(method, path, body) {
        const res = await fetch(`${API_BASE}${path}`, {
            method,
            headers: {
                "Authorization": `Bearer ${this.config.apiKey}`,
                "Content-Type": "application/json"
            },
            body: body ? JSON.stringify(body) : undefined
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
            const msg = json?.message ?? json?.error ?? res.statusText ?? `HTTP ${res.status}`;
            const err = new Error(`Crusoe API error: ${msg}`);
            err.status = res.status;
            err.body = json;
            throw err;
        }
        return json;
    }

    async validateAuth() {
        const data = await this._request("GET", "/projects");
        if (!Array.isArray(data?.items ?? data)) throw new Error("Crusoe: API key invalid");
        return { ok: true, accountInfo: { projects: (data.items ?? data).length } };
    }

    async listGpuTypes() {
        const data = await this._request("GET", "/compute/vms/products");
        return (data?.items ?? data ?? []).map((p) => ({
            id: p.product_name ?? p.name,
            name: p.gpu_type ?? p.name,
            vramGb: p.gpu_memory_gib ?? null,
            pricePerHour: p.price_per_hour_usd ?? null
        }));
    }

    async listRegions() {
        const data = await this._request("GET", "/locations");
        return (data?.items ?? data ?? []).map((r) => ({ id: r.name, name: r.display_name ?? r.name }));
    }

    async findOffers(request = {}) {
        const products = (await this._request("GET", "/compute/vms/products"))?.items ?? [];

        const wantCanonical = request.gpu ? canonicalize(request.gpu) : null;
        const aliases = wantCanonical
            ? [wantCanonical, ...aliasesFor(wantCanonical)].map((a) => a.toLowerCase())
            : null;

        const offers = [];
        for (const p of products) {
            const gpuStr = (p.gpu_type ?? p.product_name ?? "").toLowerCase();
            if (aliases && !aliases.some((a) => gpuStr.includes(a))) continue;
            const vramGb = p.gpu_memory_gib ?? 0;
            if (request.vramMin && vramGb < request.vramMin) continue;
            const price = p.price_per_hour_usd ?? 0;
            if (request.maxPricePerHour != null && price > request.maxPricePerHour) continue;

            for (const loc of p.locations ?? []) {
                if (request.region && loc !== request.region) continue;
                offers.push({
                    providerId: "crusoe",
                    offerId: `${p.product_name ?? p.name}@${loc}`,
                    gpu: { name: p.gpu_type ?? p.name, count: p.gpu_count ?? 1, vramGb },
                    cpu: p.vcpu_count ? { cores: p.vcpu_count } : undefined,
                    ramGb: p.memory_gib,
                    diskGb: p.local_storage_gib,
                    region: loc,
                    pricePerHour: price,
                    deployStyle: "vm-ssh",
                    available: true,
                    raw: { product_name: p.product_name ?? p.name, location: loc, product: p }
                });
            }
        }
        return offers;
    }

    _buildStartupScript(envMap, opts = {}) {
        if (opts.engine === "vllm") {
            return composeInstallScript({ infernetEnv: envMap, vllmConfig: opts.vllmConfig ?? {} });
        }
        const exports = Object.entries(envMap).map(([k, v]) => `export ${k}=${JSON.stringify(String(v))}`).join("\n");
        return ["#!/bin/bash", "set -eux", exports,
            `curl -fsSL ${DEFAULT_INSTALLER} | bash`,
            "infernet register || true", "infernet start || true"].join("\n");
    }

    async createNode(request = {}) {
        const {
            gpu, name, productName, region, sshPublicKey, image = "ubuntu22.04-nvidia-pcie-docker",
            env = {}, controlPlaneUrl = "", engine = "ollama", model = null,
            hourlyPrice = 0, vramGb = 0, gpuCount = 1
        } = request;

        if (!sshPublicKey) {
            throw new Error("crusoe: createNode requires sshPublicKey");
        }

        let finalProduct = productName;
        let finalLocation = region;
        if (!finalProduct) {
            const offers = await this.findOffers({ gpu, region });
            if (offers.length === 0) throw new Error(`crusoe: no product matched gpu="${gpu}"`);
            offers.sort((a, b) => a.pricePerHour - b.pricePerHour);
            finalProduct = offers[0].raw.product_name;
            finalLocation = finalLocation ?? offers[0].raw.location;
        }
        if (!finalLocation) throw new Error("crusoe: createNode requires region");

        const localId = state.generateNodeId();
        const vmName = name ?? localId;

        const startupScript = this._buildStartupScript({
            INFERNET_NODE_NAME: vmName,
            INFERNET_CONTROL_PLANE_URL: controlPlaneUrl,
            INFERNET_ENGINE: engine,
            ...(model ? { INFERNET_MODEL: model } : {}),
            ...env
        }, { engine, vllmConfig: { model, ...(request.vllm ?? {}) } });

        const data = await this._request("POST", this._project("/compute/instances"), {
            name: vmName,
            product_name: finalProduct,
            location: finalLocation,
            image,
            ssh_public_key: sshPublicKey,
            startup_script: startupScript
        });

        const inst = data?.instance ?? data;
        const vmId = inst?.id;
        if (!vmId) throw new Error("crusoe: create returned no instance id");

        const record = {
            id: localId,
            provider: "crusoe",
            providerNodeId: vmId,
            name: vmName,
            gpu: gpu ?? finalProduct,
            gpuCount,
            vramGb,
            region: finalLocation,
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
        if (!node?.providerNodeId) throw new Error("crusoe: waitUntilReady requires node.providerNodeId");
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const data = await this._request("GET", this._project(`/compute/instances/${node.providerNodeId}`));
            const inst = data?.instance ?? data;
            const state_ = (inst?.state ?? inst?.status ?? "").toUpperCase();
            const ip = inst?.network_interfaces?.[0]?.ips?.[0]?.public_ipv4?.address
                ?? inst?.public_ip ?? null;
            if ((state_ === "STATE_RUNNING" || state_ === "RUNNING") && ip) {
                const endpointUrl = `http://${ip}:46337`;
                return state.updateNode(node.id, { status: "running", endpointUrl, ip });
            }
            await new Promise((r) => setTimeout(r, 5000));
        }
        await state.updateNode(node.id, { status: "error", error_log: "instance did not reach RUNNING in time" });
        throw new Error(`Crusoe instance ${node.providerNodeId} did not reach RUNNING within ${Math.round(timeoutMs / 1000)}s`);
    }

    async bootstrapNode(node, request = {}) {
        if (!node?.endpointUrl && !node?.ip) return { ok: false, reason: "no endpointUrl/ip on node" };
        if ((request.engine ?? node.engine) === "vllm") {
            return pollVllmHealth(node.ip ?? node.endpointUrl, { port: request.vllm?.port ?? 8000 });
        }
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
        if (!local || local.provider !== "crusoe") throw new Error(`crusoe: no local record for nodeId=${nodeId}`);
        try {
            const data = await this._request("GET", this._project(`/compute/instances/${local.providerNodeId}`));
            const inst = data?.instance ?? data;
            if (inst?.state ?? inst?.status) local.liveStatus = inst.state ?? inst.status;
        } catch { /* best-effort */ }
        return local;
    }

    async listNodes() {
        const all = await state.listNodes();
        return all.filter((n) => n.provider === "crusoe");
    }

    async stopNode(nodeId) {
        const local = await state.loadNode(nodeId);
        if (!local || local.provider !== "crusoe") throw new Error(`crusoe: no local record for nodeId=${nodeId}`);
        await this._request("POST", this._project(`/compute/instances/${local.providerNodeId}/actions/stop`));
        await state.updateNode(nodeId, { status: "stopped" });
        return { ok: true };
    }

    async startNode(nodeId) {
        const local = await state.loadNode(nodeId);
        if (!local || local.provider !== "crusoe") throw new Error(`crusoe: no local record for nodeId=${nodeId}`);
        await this._request("POST", this._project(`/compute/instances/${local.providerNodeId}/actions/start`));
        await state.updateNode(nodeId, { status: "running" });
        return { ok: true };
    }

    async destroyNode(nodeId) {
        const local = await state.loadNode(nodeId);
        if (!local || local.provider !== "crusoe") throw new Error(`crusoe: no local record for nodeId=${nodeId}`);
        await this._request("DELETE", this._project(`/compute/instances/${local.providerNodeId}`));
        await state.updateNode(nodeId, { status: "destroyed" });
        return { ok: true };
    }

    async logs(nodeId, _opts = {}) {
        const local = await state.loadNode(nodeId).catch(() => null);
        const err = new NotSupportedError("logs", "crusoe");
        const sshHint = local?.ip ? `\nSSH and tail the daemon log:\n  ssh ubuntu@${local.ip} 'tail -200 /var/log/infernet/daemon.log'` : "";
        err.message = `crusoe: instance logs are not exposed via the API.\nView at: https://console.crusoecloud.com/compute/instances` + sshHint;
        throw err;
    }
}

export default CrusoeProvider;
