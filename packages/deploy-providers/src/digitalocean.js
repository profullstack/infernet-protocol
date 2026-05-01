/**
 * DigitalOcean adapter — create a Droplet via the v2 REST API.
 *
 * Auth: personal access token from
 * https://cloud.digitalocean.com/account/api/tokens (write scope).
 *
 * The operator's API key is never persisted server-side; the CLI keeps
 * it in ~/.config/infernet/config.json (mode 0600) and passes it
 * through to this adapter on each call.
 */

const API_BASE = "https://api.digitalocean.com/v2";

async function doFetch({ apiKey, path, method = "GET", body }) {
    const res = await fetch(`${API_BASE}${path}`, {
        method,
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
        },
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await res.text();
    let parsed;
    try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { raw: text }; }
    if (!res.ok) {
        const msg = parsed?.message ?? parsed?.id ?? `HTTP ${res.status}`;
        const err = new Error(`DigitalOcean API error: ${msg}`);
        err.status = res.status;
        err.body = parsed;
        throw err;
    }
    return parsed;
}

export const meta = {
    id: "digitalocean",
    label: "DigitalOcean",
    keyUrl: "https://cloud.digitalocean.com/account/api/tokens",
    sizesDoc: "https://slugs.do-api.dev",
    regionsDoc: "https://docs.digitalocean.com/products/platform/availability-matrix/"
};

/**
 * Create a Droplet with cloud-init user_data.
 *
 * @param {object} args
 * @param {string} args.apiKey       DO personal access token
 * @param {string} args.name         Droplet name
 * @param {string} args.size         Slug, e.g. "gpu-h100x1-80gb" or "s-1vcpu-1gb"
 * @param {string} args.region       Slug, e.g. "sfo3"
 * @param {string} args.userData     Full cloud-init script body
 * @param {string} [args.image]      Image slug; default ubuntu-22-04-x64 (or
 *                                   "gpu-h100x1-base" for GPU sizes — caller decides)
 * @param {Array<number|string>} [args.sshKeyIds]
 * @param {boolean} [args.ipv6=true]
 * @param {boolean} [args.monitoring=true]
 * @param {Array<string>} [args.tags=["infernet"]]
 */
export async function createDeployment({
    apiKey,
    name,
    size,
    region,
    userData,
    image,
    sshKeyIds = [],
    ipv6 = true,
    monitoring = true,
    tags = ["infernet"]
}) {
    if (!apiKey) throw new Error("DigitalOcean: apiKey required");
    if (!name) throw new Error("DigitalOcean: name required");
    if (!size) throw new Error("DigitalOcean: size required");
    if (!region) throw new Error("DigitalOcean: region required");
    if (!userData) throw new Error("DigitalOcean: userData required");

    // GPU sizes need a GPU base image; everything else defaults to Ubuntu 22.04.
    const resolvedImage = image ?? (size.startsWith("gpu-") ? "gpu-h100x1-base" : "ubuntu-22-04-x64");

    const body = {
        name,
        region,
        size,
        image: resolvedImage,
        ssh_keys: sshKeyIds,
        backups: false,
        ipv6,
        monitoring,
        tags,
        user_data: userData,
        vpc_uuid: ""
    };

    const data = await doFetch({ apiKey, path: "/droplets", method: "POST", body });
    const droplet = data?.droplet;
    return {
        deploymentId: String(droplet?.id ?? ""),
        status: droplet?.status ?? "new",
        // IP not assigned at creation; the caller should poll getDeployment.
        endpoint: null,
        raw: droplet
    };
}

export async function getDeployment({ apiKey, deploymentId }) {
    const data = await doFetch({ apiKey, path: `/droplets/${deploymentId}` });
    const droplet = data?.droplet;
    const v4 = droplet?.networks?.v4 ?? [];
    const publicIp = v4.find((n) => n.type === "public")?.ip_address ?? null;
    return {
        status: droplet?.status ?? "unknown",
        endpoint: publicIp,
        raw: droplet
    };
}

export async function destroyDeployment({ apiKey, deploymentId }) {
    await doFetch({ apiKey, path: `/droplets/${deploymentId}`, method: "DELETE" });
    return { ok: true };
}

// ---- IPIP-0019 DeployProvider class adapter ----

import { DeployProvider, NotSupportedError } from "./providers/base.js";
import { canonicalize, aliasesFor } from "./gpu-normalize.js";
import * as state from "./state.js";

const DEFAULT_INSTALLER =
    process.env.INFERNET_INSTALLER_URL
    ?? "https://infernetprotocol.com/install.sh";

// DO publishes monthly prices; convert to hourly with a 730-hour month.
const HOURS_PER_MONTH = 730;

export class DigitalOceanProvider extends DeployProvider {
    constructor(config = {}) {
        super({ ...config, providerId: "digitalocean" });
    }

    async _fetch(path, { method = "GET", body } = {}) {
        return doFetch({ apiKey: this.config.apiKey, path, method, body });
    }

    async validateAuth() {
        const data = await this._fetch("/account");
        if (!data?.account) throw new Error("DigitalOcean: API key invalid");
        return { ok: true, accountInfo: data.account };
    }

    async listGpuTypes() {
        const data = await this._fetch("/sizes?per_page=200");
        const sizes = (data?.sizes ?? []).filter((s) => s.slug?.startsWith("gpu-"));
        return sizes.map((s) => ({
            id: s.slug,
            name: s.description ?? s.slug,
            vramGb: this._inferVramFromSlug(s.slug),
            pricePerHour: (s.price_monthly ?? 0) / HOURS_PER_MONTH
        }));
    }

    _inferVramFromSlug(slug) {
        const m = slug?.match(/-(\d+)gb/i);
        return m ? Number(m[1]) : null;
    }

    async listRegions() {
        const data = await this._fetch("/regions");
        return (data?.regions ?? [])
            .filter((r) => r.available)
            .map((r) => ({ id: r.slug, name: r.name }));
    }

    async findOffers(request = {}) {
        const data = await this._fetch("/sizes?per_page=200");
        const sizes = (data?.sizes ?? []).filter((s) => s.slug?.startsWith("gpu-"));

        const wantCanonical = request.gpu ? canonicalize(request.gpu) : null;
        const aliases = wantCanonical
            ? [wantCanonical, ...aliasesFor(wantCanonical)].map((a) => a.toLowerCase())
            : null;

        const offers = [];
        for (const s of sizes) {
            const slug = s.slug.toLowerCase();
            const desc = (s.description ?? "").toLowerCase();
            if (aliases && !aliases.some((a) => slug.includes(a) || desc.includes(a))) continue;
            const vramGb = this._inferVramFromSlug(s.slug);
            if (request.vramMin && vramGb && vramGb < request.vramMin) continue;
            const pricePerHour = (s.price_monthly ?? 0) / HOURS_PER_MONTH;
            if (request.maxPricePerHour != null && pricePerHour > request.maxPricePerHour) continue;

            for (const region of s.regions ?? []) {
                if (request.region && region !== request.region) continue;
                offers.push({
                    providerId: "digitalocean",
                    offerId: `${s.slug}@${region}`,
                    gpu: { name: s.description ?? s.slug, count: 1, vramGb: vramGb ?? 0 },
                    cpu: { cores: s.vcpus },
                    ramGb: s.memory ? Math.round(s.memory / 1024) : undefined,
                    diskGb: s.disk,
                    region,
                    pricePerHour,
                    deployStyle: "vm-ssh",
                    available: true,
                    raw: { slug: s.slug, region, size: s }
                });
            }
        }
        return offers;
    }

    _buildUserData(envMap) {
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
            gpu, name, size, region, image, sshKeyIds = [],
            env = {}, controlPlaneUrl = "", engine = "ollama", model = null,
            hourlyPrice = 0, vramGb = 0
        } = request;

        // Resolve size/region from canonical GPU if not given explicitly.
        let finalSize = size;
        let finalRegion = region;
        if (!finalSize) {
            const offers = await this.findOffers({ gpu, region });
            if (offers.length === 0) throw new Error(`digitalocean: no GPU droplet matched gpu="${gpu}"${region ? ` in region=${region}` : ""}`);
            offers.sort((a, b) => a.pricePerHour - b.pricePerHour);
            finalSize = offers[0].raw.slug;
            finalRegion = offers[0].raw.region;
        }
        if (!finalRegion) throw new Error("digitalocean: createNode requires region");

        const localId = state.generateNodeId();
        const dropletName = name ?? localId;

        const userData = this._buildUserData({
            INFERNET_NODE_NAME: dropletName,
            INFERNET_CONTROL_PLANE_URL: controlPlaneUrl,
            INFERNET_ENGINE: engine,
            ...(model ? { INFERNET_MODEL: model } : {}),
            ...env
        });

        const result = await createDeployment({
            apiKey: this.config.apiKey,
            name: dropletName,
            size: finalSize,
            region: finalRegion,
            userData, image, sshKeyIds
        });

        const record = {
            id: localId,
            provider: "digitalocean",
            providerNodeId: result.deploymentId,
            name: dropletName,
            gpu: gpu ?? finalSize,
            gpuCount: 1,
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
        if (!node?.providerNodeId) throw new Error("digitalocean: waitUntilReady requires node.providerNodeId");
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const live = await getDeployment({ apiKey: this.config.apiKey, deploymentId: node.providerNodeId });
            if ((live?.status ?? "").toLowerCase() === "active" && live?.endpoint) {
                const endpointUrl = `http://${live.endpoint}:46337`;
                return state.updateNode(node.id, { status: "running", endpointUrl, ip: live.endpoint });
            }
            await new Promise((r) => setTimeout(r, 5000));
        }
        await state.updateNode(node.id, { status: "error", error_log: "droplet did not reach ACTIVE in time" });
        throw new Error(`DigitalOcean droplet ${node.providerNodeId} did not reach ACTIVE within ${Math.round(timeoutMs / 1000)}s`);
    }

    async bootstrapNode(node, _request) {
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
        if (!local || local.provider !== "digitalocean") throw new Error(`digitalocean: no local record for nodeId=${nodeId}`);
        try {
            const live = await getDeployment({ apiKey: this.config.apiKey, deploymentId: local.providerNodeId });
            if (live?.status) local.liveStatus = live.status;
        } catch { /* best-effort */ }
        return local;
    }

    async listNodes() {
        const all = await state.listNodes();
        return all.filter((n) => n.provider === "digitalocean");
    }

    async stopNode(nodeId) {
        const local = await state.loadNode(nodeId);
        if (!local || local.provider !== "digitalocean") throw new Error(`digitalocean: no local record for nodeId=${nodeId}`);
        await this._fetch(`/droplets/${local.providerNodeId}/actions`, { method: "POST", body: { type: "power_off" } });
        await state.updateNode(nodeId, { status: "stopped" });
        return { ok: true };
    }

    async startNode(nodeId) {
        const local = await state.loadNode(nodeId);
        if (!local || local.provider !== "digitalocean") throw new Error(`digitalocean: no local record for nodeId=${nodeId}`);
        await this._fetch(`/droplets/${local.providerNodeId}/actions`, { method: "POST", body: { type: "power_on" } });
        await state.updateNode(nodeId, { status: "running" });
        return { ok: true };
    }

    async destroyNode(nodeId) {
        const local = await state.loadNode(nodeId);
        if (!local || local.provider !== "digitalocean") throw new Error(`digitalocean: no local record for nodeId=${nodeId}`);
        await destroyDeployment({ apiKey: this.config.apiKey, deploymentId: local.providerNodeId });
        await state.updateNode(nodeId, { status: "destroyed" });
        return { ok: true };
    }

    async logs(nodeId, _opts = {}) {
        const local = await state.loadNode(nodeId).catch(() => null);
        const err = new NotSupportedError("logs", "digitalocean");
        const sshHint = local?.ip
            ? `\nSSH and tail the daemon log:\n  ssh root@${local.ip} 'tail -200 /var/log/infernet/daemon.log'`
            : "";
        err.message = `digitalocean: droplet logs are not exposed via the API.\nView at: https://cloud.digitalocean.com/droplets` + sshHint;
        throw err;
    }
}

export default DigitalOceanProvider;
