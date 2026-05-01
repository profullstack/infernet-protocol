/**
 * Hyperstack adapter — IPIP-0019 DeployProvider implementation.
 *
 * REST API: https://infrahub-api.nexgencloud.com/v1
 * Docs:     https://infrahub-doc.nexgencloud.com/
 * Auth:     api_key header (Bearer-style token, but sent as `api_key`).
 *
 * VM-based with cloud-init via the `user_data` field on
 * POST /core/virtual-machines.
 *
 * Verified against current docs: 2026-05-01.
 */

import { DeployProvider, NotSupportedError } from "./base.js";
import { canonicalize, aliasesFor } from "../gpu-normalize.js";
import * as state from "../state.js";
import { composeInstallScript, pollVllmHealth } from "../vllm-bootstrap.js";

const API_BASE = "https://infrahub-api.nexgencloud.com/v1";
const DEFAULT_INSTALLER = process.env.INFERNET_INSTALLER_URL ?? "https://infernetprotocol.com/install.sh";

export class HyperstackProvider extends DeployProvider {
    constructor(config = {}) {
        super({ ...config, providerId: "hyperstack" });
    }

    async _request(method, path, body) {
        const res = await fetch(`${API_BASE}${path}`, {
            method,
            headers: {
                "api_key": this.config.apiKey,
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: body ? JSON.stringify(body) : undefined
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json?.status === false) {
            const msg = json?.message ?? json?.error ?? res.statusText ?? `HTTP ${res.status}`;
            const err = new Error(`Hyperstack API error: ${msg}`);
            err.status = res.status;
            err.body = json;
            throw err;
        }
        return json;
    }

    async validateAuth() {
        // /core/profile returns the authenticated user info.
        const data = await this._request("GET", "/core/profile");
        if (!data?.profile) throw new Error("Hyperstack: API key invalid");
        return { ok: true, accountInfo: data.profile };
    }

    async listGpuTypes() {
        const data = await this._request("GET", "/core/flavors");
        return (data?.data ?? data?.flavors ?? []).map((f) => ({
            id: f.name,
            name: f.gpu ?? f.name,
            vramGb: f.gpu_memory_gb ?? null,
            pricePerHour: f.cost_per_hour ?? null
        }));
    }

    async listRegions() {
        const data = await this._request("GET", "/core/regions");
        return (data?.regions ?? data?.data ?? []).map((r) => ({ id: r.name, name: r.name }));
    }

    async findOffers(request = {}) {
        const flavors = (await this._request("GET", "/core/flavors"))?.data
            ?? (await this._request("GET", "/core/flavors"))?.flavors
            ?? [];

        const wantCanonical = request.gpu ? canonicalize(request.gpu) : null;
        const aliases = wantCanonical
            ? [wantCanonical, ...aliasesFor(wantCanonical)].map((a) => a.toLowerCase())
            : null;

        const offers = [];
        for (const f of flavors) {
            const gpuStr = (f.gpu ?? f.name ?? "").toLowerCase();
            if (aliases && !aliases.some((a) => gpuStr.includes(a))) continue;
            const vramGb = f.gpu_memory_gb ?? 0;
            if (request.vramMin && vramGb < request.vramMin) continue;
            const price = f.cost_per_hour ?? 0;
            if (request.maxPricePerHour != null && price > request.maxPricePerHour) continue;

            for (const reg of f.regions ?? [f.region].filter(Boolean)) {
                if (request.region && reg !== request.region) continue;
                offers.push({
                    providerId: "hyperstack",
                    offerId: `${f.name}@${reg}`,
                    gpu: { name: f.gpu ?? f.name, count: f.gpu_count ?? 1, vramGb },
                    cpu: f.cpu ? { cores: f.cpu } : undefined,
                    ramGb: f.ram ?? undefined,
                    diskGb: f.disk ?? undefined,
                    region: reg,
                    pricePerHour: price,
                    deployStyle: "vm-ssh",
                    available: true,
                    raw: { flavor_name: f.name, region: reg, flavor: f }
                });
            }
        }
        return offers;
    }

    _buildUserData(envMap, opts = {}) {
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
            gpu, name, flavorName, region, sshKeyName,
            env = {}, controlPlaneUrl = "", engine = "ollama", model = null,
            hourlyPrice = 0, vramGb = 0, gpuCount = 1
        } = request;

        if (!sshKeyName) {
            throw new Error("hyperstack: createNode requires sshKeyName (upload via /core/keypairs first)");
        }

        let finalFlavor = flavorName;
        let finalRegion = region;
        if (!finalFlavor) {
            const offers = await this.findOffers({ gpu, region });
            if (offers.length === 0) throw new Error(`hyperstack: no flavor matched gpu="${gpu}"`);
            offers.sort((a, b) => a.pricePerHour - b.pricePerHour);
            finalFlavor = offers[0].raw.flavor_name;
            finalRegion = finalRegion ?? offers[0].raw.region;
        }
        if (!finalRegion) throw new Error("hyperstack: createNode requires region");

        const localId = state.generateNodeId();
        const vmName = name ?? localId;

        const userData = this._buildUserData({
            INFERNET_NODE_NAME: vmName,
            INFERNET_CONTROL_PLANE_URL: controlPlaneUrl,
            INFERNET_ENGINE: engine,
            ...(model ? { INFERNET_MODEL: model } : {}),
            ...env
        }, { engine, vllmConfig: { model, ...(request.vllm ?? {}) } });

        const data = await this._request("POST", "/core/virtual-machines", {
            name: vmName,
            environment_name: finalRegion,
            image_name: "Ubuntu Server 22.04 LTS R535 CUDA 12.2",
            flavor_name: finalFlavor,
            key_name: sshKeyName,
            count: 1,
            assign_floating_ip: true,
            user_data: userData,
            security_rules: [{ direction: "ingress", protocol: "tcp", port_range_min: 46337, port_range_max: 46337 }]
        });

        const vm = data?.instances?.[0] ?? data?.instance ?? data;
        const vmId = vm?.id ?? vm?.uuid;
        if (!vmId) throw new Error("hyperstack: create returned no instance id");

        const record = {
            id: localId,
            provider: "hyperstack",
            providerNodeId: String(vmId),
            name: vmName,
            gpu: gpu ?? finalFlavor,
            gpuCount,
            vramGb,
            region: finalRegion,
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
        if (!node?.providerNodeId) throw new Error("hyperstack: waitUntilReady requires node.providerNodeId");
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const data = await this._request("GET", `/core/virtual-machines/${node.providerNodeId}`);
            const vm = data?.instance ?? data;
            const status = (vm?.status ?? "").toUpperCase();
            const ip = vm?.floating_ip ?? vm?.fixed_ip ?? null;
            if (status === "ACTIVE" && ip) {
                const endpointUrl = `http://${ip}:46337`;
                return state.updateNode(node.id, { status: "running", endpointUrl, ip });
            }
            await new Promise((r) => setTimeout(r, 5000));
        }
        await state.updateNode(node.id, { status: "error", error_log: "vm did not reach ACTIVE in time" });
        throw new Error(`Hyperstack VM ${node.providerNodeId} did not reach ACTIVE within ${Math.round(timeoutMs / 1000)}s`);
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
        if (!local || local.provider !== "hyperstack") throw new Error(`hyperstack: no local record for nodeId=${nodeId}`);
        try {
            const data = await this._request("GET", `/core/virtual-machines/${local.providerNodeId}`);
            const vm = data?.instance ?? data;
            if (vm?.status) local.liveStatus = vm.status;
        } catch { /* best-effort */ }
        return local;
    }

    async listNodes() {
        const all = await state.listNodes();
        return all.filter((n) => n.provider === "hyperstack");
    }

    async stopNode(nodeId) {
        const local = await state.loadNode(nodeId);
        if (!local || local.provider !== "hyperstack") throw new Error(`hyperstack: no local record for nodeId=${nodeId}`);
        await this._request("GET", `/core/virtual-machines/${local.providerNodeId}/stop`);
        await state.updateNode(nodeId, { status: "stopped" });
        return { ok: true };
    }

    async startNode(nodeId) {
        const local = await state.loadNode(nodeId);
        if (!local || local.provider !== "hyperstack") throw new Error(`hyperstack: no local record for nodeId=${nodeId}`);
        await this._request("GET", `/core/virtual-machines/${local.providerNodeId}/start`);
        await state.updateNode(nodeId, { status: "running" });
        return { ok: true };
    }

    async destroyNode(nodeId) {
        const local = await state.loadNode(nodeId);
        if (!local || local.provider !== "hyperstack") throw new Error(`hyperstack: no local record for nodeId=${nodeId}`);
        await this._request("DELETE", `/core/virtual-machines/${local.providerNodeId}`);
        await state.updateNode(nodeId, { status: "destroyed" });
        return { ok: true };
    }

    async logs(nodeId, _opts = {}) {
        const local = await state.loadNode(nodeId).catch(() => null);
        const err = new NotSupportedError("logs", "hyperstack");
        const sshHint = local?.ip ? `\nSSH and tail the daemon log:\n  ssh ubuntu@${local.ip} 'tail -200 /var/log/infernet/daemon.log'` : "";
        err.message = `hyperstack: VM logs are not exposed via the API.\nView at: https://infrahub.nexgencloud.com/dashboard` + sshHint;
        throw err;
    }
}

export default HyperstackProvider;
