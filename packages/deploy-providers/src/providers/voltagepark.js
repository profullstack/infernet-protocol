/**
 * Voltage Park adapter — IPIP-0019 DeployProvider implementation.
 *
 * REST API: https://api.voltagepark.com (subject to change — Voltage Park's
 * public self-serve API is newer than the others; some endpoints may
 * require sales contact or be in private beta as of 2026-05-01).
 * Docs:     https://docs.voltagepark.com/
 * Auth:     Bearer token from the Voltage Park dashboard.
 *
 * VM-based pool of pure H100 SXM5/H100 PCIe instances. Cloud-init via
 * the `user_data` field on POST /instances (best-effort — verify against
 * current docs when wiring real keys).
 *
 * If you hit "endpoint not found" errors, the API surface has likely
 * changed: read https://docs.voltagepark.com/ and adjust the paths
 * below. The IPIP-0019 contract this class implements is stable.
 */

import { DeployProvider, NotSupportedError } from "./base.js";
import { canonicalize, aliasesFor } from "../gpu-normalize.js";
import * as state from "../state.js";
import { composeInstallScript, pollVllmHealth } from "../vllm-bootstrap.js";

const API_BASE = process.env.VOLTAGEPARK_API_BASE ?? "https://api.voltagepark.com";
const DEFAULT_INSTALLER = process.env.INFERNET_INSTALLER_URL ?? "https://infernetprotocol.com/install.sh";

export class VoltageParkProvider extends DeployProvider {
    constructor(config = {}) {
        super({ ...config, providerId: "voltagepark" });
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
        const text = await res.text();
        const json = text ? JSON.parse(text) : {};
        if (!res.ok) {
            const msg = json?.message ?? json?.error ?? res.statusText ?? `HTTP ${res.status}`;
            const err = new Error(`Voltage Park API error: ${msg}`);
            err.status = res.status;
            err.body = json;
            throw err;
        }
        return json;
    }

    async validateAuth() {
        // Probe with /v1/account or /v1/instances depending on what's exposed.
        try {
            await this._request("GET", "/v1/account");
        } catch {
            await this._request("GET", "/v1/instances");
        }
        return { ok: true };
    }

    async listGpuTypes() {
        // Voltage Park is essentially H100-only; surface the catalog as
        // a single entry until more SKUs ship.
        const data = await this._request("GET", "/v1/instance-types").catch(() => null);
        if (data?.instance_types) {
            return data.instance_types.map((t) => ({
                id: t.id ?? t.name,
                name: t.gpu ?? t.name ?? "H100",
                vramGb: t.gpu_memory_gib ?? 80,
                pricePerHour: t.price_per_hour ?? null
            }));
        }
        return [{ id: "h100-sxm5-80gb", name: "H100 SXM5", vramGb: 80, pricePerHour: 1.99 }];
    }

    async listRegions() {
        const data = await this._request("GET", "/v1/regions").catch(() => null);
        if (data?.regions) return data.regions.map((r) => ({ id: r.id ?? r.name, name: r.name }));
        return [{ id: "us-central", name: "US Central" }];
    }

    async findOffers(request = {}) {
        const types = await this.listGpuTypes();
        const regions = await this.listRegions();

        const wantCanonical = request.gpu ? canonicalize(request.gpu) : null;
        const aliases = wantCanonical
            ? [wantCanonical, ...aliasesFor(wantCanonical)].map((a) => a.toLowerCase())
            : null;

        const offers = [];
        for (const t of types) {
            const gpuStr = (t.name ?? "").toLowerCase();
            if (aliases && !aliases.some((a) => gpuStr.includes(a))) continue;
            if (request.vramMin && t.vramGb && t.vramGb < request.vramMin) continue;
            const price = t.pricePerHour ?? 0;
            if (request.maxPricePerHour != null && price > request.maxPricePerHour) continue;

            for (const reg of regions) {
                if (request.region && reg.id !== request.region) continue;
                offers.push({
                    providerId: "voltagepark",
                    offerId: `${t.id}@${reg.id}`,
                    gpu: { name: t.name, count: request.gpuCount ?? 1, vramGb: t.vramGb ?? 80 },
                    region: reg.id,
                    pricePerHour: price,
                    deployStyle: "vm-ssh",
                    available: true,
                    raw: { instance_type_id: t.id, region: reg.id }
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
            gpu, name, instanceTypeId, region, sshPublicKey,
            env = {}, controlPlaneUrl = "", engine = "ollama", model = null,
            hourlyPrice = 0, vramGb = 80, gpuCount = 1
        } = request;

        if (!sshPublicKey) {
            throw new Error("voltagepark: createNode requires sshPublicKey");
        }

        let finalType = instanceTypeId;
        let finalRegion = region;
        if (!finalType) {
            const offers = await this.findOffers({ gpu, region });
            if (offers.length === 0) throw new Error(`voltagepark: no instance type matched gpu="${gpu}"`);
            offers.sort((a, b) => a.pricePerHour - b.pricePerHour);
            finalType = offers[0].raw.instance_type_id;
            finalRegion = finalRegion ?? offers[0].raw.region;
        }

        const localId = state.generateNodeId();
        const vmName = name ?? localId;

        const userData = this._buildUserData({
            INFERNET_NODE_NAME: vmName,
            INFERNET_CONTROL_PLANE_URL: controlPlaneUrl,
            INFERNET_ENGINE: engine,
            ...(model ? { INFERNET_MODEL: model } : {}),
            ...env
        }, { engine, vllmConfig: { model, ...(request.vllm ?? {}) } });

        const data = await this._request("POST", "/v1/instances", {
            name: vmName,
            instance_type_id: finalType,
            region: finalRegion,
            ssh_public_key: sshPublicKey,
            user_data: userData
        });

        const inst = data?.instance ?? data;
        const vmId = inst?.id ?? inst?.instance_id;
        if (!vmId) throw new Error("voltagepark: create returned no instance id");

        const record = {
            id: localId,
            provider: "voltagepark",
            providerNodeId: vmId,
            name: vmName,
            gpu: gpu ?? finalType,
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
        if (!node?.providerNodeId) throw new Error("voltagepark: waitUntilReady requires node.providerNodeId");
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const data = await this._request("GET", `/v1/instances/${node.providerNodeId}`);
            const inst = data?.instance ?? data;
            const status = (inst?.status ?? inst?.state ?? "").toLowerCase();
            const ip = inst?.ip ?? inst?.public_ip ?? null;
            if ((status === "running" || status === "active") && ip) {
                const endpointUrl = `http://${ip}:46337`;
                return state.updateNode(node.id, { status: "running", endpointUrl, ip });
            }
            await new Promise((r) => setTimeout(r, 5000));
        }
        await state.updateNode(node.id, { status: "error", error_log: "instance did not reach RUNNING in time" });
        throw new Error(`Voltage Park instance ${node.providerNodeId} did not reach RUNNING within ${Math.round(timeoutMs / 1000)}s`);
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
        if (!local || local.provider !== "voltagepark") throw new Error(`voltagepark: no local record for nodeId=${nodeId}`);
        try {
            const data = await this._request("GET", `/v1/instances/${local.providerNodeId}`);
            const inst = data?.instance ?? data;
            if (inst?.status ?? inst?.state) local.liveStatus = inst.status ?? inst.state;
        } catch { /* best-effort */ }
        return local;
    }

    async listNodes() {
        const all = await state.listNodes();
        return all.filter((n) => n.provider === "voltagepark");
    }

    async stopNode(nodeId) {
        const local = await state.loadNode(nodeId);
        if (!local || local.provider !== "voltagepark") throw new Error(`voltagepark: no local record for nodeId=${nodeId}`);
        await this._request("POST", `/v1/instances/${local.providerNodeId}/stop`);
        await state.updateNode(nodeId, { status: "stopped" });
        return { ok: true };
    }

    async startNode(nodeId) {
        const local = await state.loadNode(nodeId);
        if (!local || local.provider !== "voltagepark") throw new Error(`voltagepark: no local record for nodeId=${nodeId}`);
        await this._request("POST", `/v1/instances/${local.providerNodeId}/start`);
        await state.updateNode(nodeId, { status: "running" });
        return { ok: true };
    }

    async destroyNode(nodeId) {
        const local = await state.loadNode(nodeId);
        if (!local || local.provider !== "voltagepark") throw new Error(`voltagepark: no local record for nodeId=${nodeId}`);
        await this._request("DELETE", `/v1/instances/${local.providerNodeId}`);
        await state.updateNode(nodeId, { status: "destroyed" });
        return { ok: true };
    }

    async logs(nodeId, _opts = {}) {
        const local = await state.loadNode(nodeId).catch(() => null);
        const err = new NotSupportedError("logs", "voltagepark");
        const sshHint = local?.ip ? `\nSSH and tail the daemon log:\n  ssh ubuntu@${local.ip} 'tail -200 /var/log/infernet/daemon.log'` : "";
        err.message = `voltagepark: instance logs are not exposed via the API.\nView at: https://dashboard.voltagepark.com/` + sshHint;
        throw err;
    }
}

export default VoltageParkProvider;
