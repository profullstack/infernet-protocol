/**
 * DataCrunch adapter — IPIP-0019 DeployProvider implementation.
 *
 * REST API: https://api.datacrunch.io/v1
 * Docs:     https://api.datacrunch.io/v1/docs
 * Auth:     OAuth2 client_credentials. Operator gets client_id +
 *           client_secret from https://cloud.datacrunch.io/account/api;
 *           we exchange them for a short-lived bearer token on each
 *           provider instance.
 *
 * Pass `{ apiKey: client_id, apiSecret: client_secret }` to the constructor
 * (or set DATACRUNCH_CLIENT_ID + DATACRUNCH_CLIENT_SECRET).
 *
 * VM-based with cloud-init via the `startup_script_id` field (script
 * has to be pre-uploaded) OR raw inline via the `user_data` field on
 * newer API versions. We use inline `user_data`.
 *
 * Verified against current docs: 2026-05-01.
 */

import { DeployProvider, NotSupportedError } from "./base.js";
import { canonicalize, aliasesFor } from "../gpu-normalize.js";
import * as state from "../state.js";
import { composeInstallScript, pollVllmHealth } from "../vllm-bootstrap.js";

const API_BASE = "https://api.datacrunch.io/v1";
const DEFAULT_INSTALLER = process.env.INFERNET_INSTALLER_URL ?? "https://infernetprotocol.com/install.sh";

export class DataCrunchProvider extends DeployProvider {
    constructor(config = {}) {
        super({ ...config, providerId: "datacrunch" });
        this.clientId = config.apiKey;
        this.clientSecret = config.apiSecret ?? process.env.DATACRUNCH_CLIENT_SECRET;
        this._token = null;
        this._tokenExpiresAt = 0;
    }

    async _getToken() {
        if (this._token && Date.now() < this._tokenExpiresAt - 60_000) return this._token;
        if (!this.clientSecret) throw new Error("datacrunch: apiSecret (client_secret) required");
        const res = await fetch(`${API_BASE}/oauth2/token`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                grant_type: "client_credentials",
                client_id: this.clientId,
                client_secret: this.clientSecret
            })
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.access_token) {
            throw new Error(`DataCrunch oauth2 error: ${json?.message ?? res.statusText}`);
        }
        this._token = json.access_token;
        this._tokenExpiresAt = Date.now() + (json.expires_in ?? 3600) * 1000;
        return this._token;
    }

    async _request(method, path, body) {
        const token = await this._getToken();
        const res = await fetch(`${API_BASE}${path}`, {
            method,
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: body ? JSON.stringify(body) : undefined
        });
        const text = await res.text();
        const json = text ? JSON.parse(text) : {};
        if (!res.ok) {
            const msg = json?.message ?? json?.error ?? res.statusText ?? `HTTP ${res.status}`;
            const err = new Error(`DataCrunch API error: ${msg}`);
            err.status = res.status;
            err.body = json;
            throw err;
        }
        return json;
    }

    async validateAuth() {
        await this._getToken();
        return { ok: true };
    }

    async listGpuTypes() {
        const types = await this._request("GET", "/instance-types");
        return (types ?? []).map((t) => ({
            id: t.instance_type ?? t.id ?? t.name,
            name: t.gpu_description ?? t.gpu ?? t.name,
            vramGb: t.gpu_memory ? Math.round(t.gpu_memory / 1024) : null,
            pricePerHour: t.price_per_hour ?? null
        }));
    }

    async listRegions() {
        const locs = await this._request("GET", "/locations");
        return (locs ?? []).map((l) => ({ id: l.code ?? l.id, name: l.name ?? l.code }));
    }

    async findOffers(request = {}) {
        const types = await this._request("GET", "/instance-types");

        const wantCanonical = request.gpu ? canonicalize(request.gpu) : null;
        const aliases = wantCanonical
            ? [wantCanonical, ...aliasesFor(wantCanonical)].map((a) => a.toLowerCase())
            : null;

        const offers = [];
        for (const t of types ?? []) {
            const gpuStr = (t.gpu_description ?? t.gpu ?? t.name ?? "").toLowerCase();
            if (aliases && !aliases.some((a) => gpuStr.includes(a))) continue;
            const vramGb = t.gpu_memory ? Math.round(t.gpu_memory / 1024) : 0;
            if (request.vramMin && vramGb < request.vramMin) continue;
            const price = t.price_per_hour ?? 0;
            if (request.maxPricePerHour != null && price > request.maxPricePerHour) continue;

            for (const loc of t.locations ?? [t.location].filter(Boolean) ?? []) {
                if (request.region && loc !== request.region) continue;
                offers.push({
                    providerId: "datacrunch",
                    offerId: `${t.instance_type ?? t.id}@${loc}`,
                    gpu: { name: t.gpu_description ?? t.gpu ?? t.name, count: t.gpu_count ?? 1, vramGb },
                    cpu: t.cpu_count ? { cores: t.cpu_count } : undefined,
                    ramGb: t.memory ? Math.round(t.memory / 1024) : undefined,
                    diskGb: t.storage ?? undefined,
                    region: loc,
                    pricePerHour: price,
                    deployStyle: "vm-ssh",
                    available: true,
                    raw: { instance_type: t.instance_type ?? t.id, location: loc, type: t }
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
            gpu, name, instanceType, region, sshKeyIds = [], image = "ubuntu-22.04-cuda-12.0",
            env = {}, controlPlaneUrl = "", engine = "ollama", model = null,
            hourlyPrice = 0, vramGb = 0, gpuCount = 1
        } = request;

        if (sshKeyIds.length === 0) {
            throw new Error("datacrunch: createNode requires sshKeyIds (upload via POST /sshkeys first)");
        }

        let finalType = instanceType;
        let finalLocation = region;
        if (!finalType) {
            const offers = await this.findOffers({ gpu, region });
            if (offers.length === 0) throw new Error(`datacrunch: no instance type matched gpu="${gpu}"`);
            offers.sort((a, b) => a.pricePerHour - b.pricePerHour);
            finalType = offers[0].raw.instance_type;
            finalLocation = finalLocation ?? offers[0].raw.location;
        }
        if (!finalLocation) throw new Error("datacrunch: createNode requires region");

        const localId = state.generateNodeId();
        const vmName = name ?? localId;

        const userData = this._buildUserData({
            INFERNET_NODE_NAME: vmName,
            INFERNET_CONTROL_PLANE_URL: controlPlaneUrl,
            INFERNET_ENGINE: engine,
            ...(model ? { INFERNET_MODEL: model } : {}),
            ...env
        }, { engine, vllmConfig: { model, ...(request.vllm ?? {}) } });

        const data = await this._request("POST", "/instances", {
            instance_type: finalType,
            location_code: finalLocation,
            image,
            ssh_key_ids: sshKeyIds,
            hostname: vmName,
            description: vmName,
            user_data: userData
        });

        const vmId = data?.id ?? data?.instance_id;
        if (!vmId) throw new Error("datacrunch: create returned no instance id");

        const record = {
            id: localId,
            provider: "datacrunch",
            providerNodeId: vmId,
            name: vmName,
            gpu: gpu ?? finalType,
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
        if (!node?.providerNodeId) throw new Error("datacrunch: waitUntilReady requires node.providerNodeId");
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const inst = await this._request("GET", `/instances/${node.providerNodeId}`);
            const status = (inst?.status ?? "").toLowerCase();
            const ip = inst?.ip ?? null;
            if (status === "running" && ip) {
                const endpointUrl = `http://${ip}:46337`;
                return state.updateNode(node.id, { status: "running", endpointUrl, ip });
            }
            await new Promise((r) => setTimeout(r, 5000));
        }
        await state.updateNode(node.id, { status: "error", error_log: "instance did not reach RUNNING in time" });
        throw new Error(`DataCrunch instance ${node.providerNodeId} did not reach RUNNING within ${Math.round(timeoutMs / 1000)}s`);
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
        if (!local || local.provider !== "datacrunch") throw new Error(`datacrunch: no local record for nodeId=${nodeId}`);
        try {
            const inst = await this._request("GET", `/instances/${local.providerNodeId}`);
            if (inst?.status) local.liveStatus = inst.status;
        } catch { /* best-effort */ }
        return local;
    }

    async listNodes() {
        const all = await state.listNodes();
        return all.filter((n) => n.provider === "datacrunch");
    }

    async stopNode(nodeId) {
        const local = await state.loadNode(nodeId);
        if (!local || local.provider !== "datacrunch") throw new Error(`datacrunch: no local record for nodeId=${nodeId}`);
        await this._request("PUT", "/instances", { id: local.providerNodeId, action: "shutdown" });
        await state.updateNode(nodeId, { status: "stopped" });
        return { ok: true };
    }

    async startNode(nodeId) {
        const local = await state.loadNode(nodeId);
        if (!local || local.provider !== "datacrunch") throw new Error(`datacrunch: no local record for nodeId=${nodeId}`);
        await this._request("PUT", "/instances", { id: local.providerNodeId, action: "start" });
        await state.updateNode(nodeId, { status: "running" });
        return { ok: true };
    }

    async destroyNode(nodeId) {
        const local = await state.loadNode(nodeId);
        if (!local || local.provider !== "datacrunch") throw new Error(`datacrunch: no local record for nodeId=${nodeId}`);
        await this._request("DELETE", `/instances/${local.providerNodeId}`);
        await state.updateNode(nodeId, { status: "destroyed" });
        return { ok: true };
    }

    async logs(nodeId, _opts = {}) {
        const local = await state.loadNode(nodeId).catch(() => null);
        const err = new NotSupportedError("logs", "datacrunch");
        const sshHint = local?.ip ? `\nSSH and tail the daemon log:\n  ssh ubuntu@${local.ip} 'tail -200 /var/log/infernet/daemon.log'` : "";
        err.message = `datacrunch: instance logs are not exposed via the API.\nView at: https://cloud.datacrunch.io/instances` + sshHint;
        throw err;
    }
}

export default DataCrunchProvider;
