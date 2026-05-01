/**
 * RunPod adapter — IPIP-0019 DeployProvider implementation.
 *
 * RunPod's API is GraphQL at https://api.runpod.io/graphql, authenticated
 * via api_key query parameter. The pod boots with the Infernet provider
 * Docker image (built by .github/workflows/release.yml and published to
 * GHCR).
 *
 * The legacy module-level functions in ../runpod.js are still exported for
 * the existing `infernet deploy runpod` CLI flow; this class is the new
 * surface that the lifecycle commands (list/status/destroy/stop/start)
 * and the pricing-aware preset dispatch consume.
 */

import { DeployProvider, NotSupportedError } from "./base.js";
import { canonicalize, aliasesFor } from "../gpu-normalize.js";
import * as state from "../state.js";

const API_URL = "https://api.runpod.io/graphql";

// Operators can override either the image or the API URL via env vars,
// useful for self-hosted forks of the provider container or testing
// against RunPod's staging cluster.
const DEFAULT_IMAGE =
    process.env.INFERNET_PROVIDER_IMAGE
    ?? "ghcr.io/infernetprotocol/infernet-provider:latest";

export class RunPodProvider extends DeployProvider {
    constructor(config = {}) {
        super({ ...config, providerId: "runpod" });
    }

    /** Internal: POST a GraphQL request, throw on errors with masked key. */
    async _gql(query, variables) {
        const url = `${API_URL}?api_key=${encodeURIComponent(this.config.apiKey)}`;
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query, variables })
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || body.errors) {
            const msg = body?.errors?.[0]?.message ?? res.statusText ?? `HTTP ${res.status}`;
            const err = new Error(`RunPod API error: ${msg}`);
            err.status = res.status;
            err.body = body;
            throw err;
        }
        return body.data;
    }

    // ---- Discovery ----

    async validateAuth() {
        const data = await this._gql(`query { myself { id email } }`);
        const me = data?.myself;
        if (!me?.id) throw new Error("RunPod: API key invalid (no user returned)");
        return { ok: true, accountInfo: { id: me.id, email: me.email } };
    }

    async listGpuTypes() {
        const data = await this._gql(`query gpuTypes {
            gpuTypes { id displayName memoryInGb communityPrice secureCloud }
        }`);
        return (data?.gpuTypes ?? []).map((g) => ({
            id: g.id,
            name: g.displayName,
            vramGb: g.memoryInGb ?? 0,
            pricePerHour: g.communityPrice ?? null,
            cloud: g.secureCloud ? "secure" : "community"
        }));
    }

    async listRegions() {
        // RunPod doesn't expose explicit regions in the public GraphQL —
        // the closest concept is community vs secure cloud.
        return [
            { id: "community", name: "Community Cloud" },
            { id: "secure",    name: "Secure Cloud" }
        ];
    }

    async findOffers(request = {}) {
        const types = await this.listGpuTypes();

        const wantCanonical = request.gpu ? canonicalize(request.gpu) : null;
        const aliases = wantCanonical
            ? [wantCanonical, ...aliasesFor(wantCanonical)].map((a) => a.toLowerCase())
            : null;

        const offers = [];
        for (const t of types) {
            const nameLower = (t.name ?? "").toLowerCase();
            if (aliases && !aliases.some((a) => nameLower.includes(a))) continue;
            if (request.vramMin && t.vramGb < request.vramMin) continue;
            if (
                request.maxPricePerHour != null &&
                t.pricePerHour != null &&
                t.pricePerHour > request.maxPricePerHour
            ) continue;

            offers.push({
                providerId: "runpod",
                offerId: t.id,
                gpu: { name: t.name, count: request.gpuCount ?? 1, vramGb: t.vramGb },
                pricePerHour: t.pricePerHour ?? 0,
                deployStyle: "docker",
                available: t.pricePerHour != null,
                region: t.cloud,
                raw: t
            });
        }
        return offers;
    }

    // ---- Lifecycle ----

    /**
     * Resolve a canonical GPU name (e.g. "4090") to a RunPod gpuTypeId
     * by matching against displayName aliases.
     */
    async _resolveGpuTypeId(gpu) {
        if (!gpu) return null;
        const canonical = canonicalize(gpu) ?? gpu;
        const aliases = [canonical, ...aliasesFor(canonical)].map((a) => a.toLowerCase());
        const types = await this.listGpuTypes();
        const match = types.find((t) =>
            aliases.some((a) => (t.name ?? "").toLowerCase().includes(a))
        );
        return match?.id ?? null;
    }

    async createNode(request = {}) {
        const {
            gpu, gpuTypeId, gpuCount = 1, name, image = DEFAULT_IMAGE,
            env = {}, containerDiskGb = 20, volumeInGb = 0, ports = "46337/tcp",
            controlPlaneUrl = "", engine = "ollama", model = null,
            hourlyPrice = 0, vramGb = 0, region = null
        } = request;

        const finalGpuTypeId = gpuTypeId ?? await this._resolveGpuTypeId(gpu);
        if (!finalGpuTypeId) {
            throw new Error(
                `runpod: could not resolve gpu="${gpu}" to a RunPod gpuTypeId. ` +
                `Pass --gpu-type <id> directly, or check listGpuTypes() for available IDs.`
            );
        }

        const localId = state.generateNodeId();
        const podName = name ?? localId;
        const cloudType = region === "secure" ? "SECURE" : "COMMUNITY";

        const envInput = Object.entries({
            INFERNET_NODE_NAME: podName,
            INFERNET_P2P_PORT: "46337",
            ...env
        }).map(([key, value]) => ({ key, value: String(value) }));

        const data = await this._gql(`
            mutation create($input: PodFindAndDeployOnDemandInput!) {
                podFindAndDeployOnDemand(input: $input) {
                    id desiredStatus imageName machineId
                }
            }
        `, {
            input: {
                name: podName,
                imageName: image,
                gpuTypeId: finalGpuTypeId,
                cloudType,
                gpuCount,
                containerDiskInGb: containerDiskGb,
                volumeInGb,
                ports,
                env: envInput,
                dockerArgs: ""
            }
        });

        const pod = data?.podFindAndDeployOnDemand;
        if (!pod?.id) throw new Error("runpod: create returned no pod id");

        const record = {
            id: localId,
            provider: "runpod",
            providerNodeId: pod.id,
            name: podName,
            gpu: gpu ?? finalGpuTypeId,
            gpuCount,
            vramGb,
            region: cloudType.toLowerCase(),
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
        if (!node?.providerNodeId) {
            throw new Error("runpod: waitUntilReady requires node.providerNodeId");
        }
        const deadline = Date.now() + timeoutMs;
        const pollInterval = 5000;

        while (Date.now() < deadline) {
            const data = await this._gql(`
                query pod($id: String!) {
                    pod(input: { podId: $id }) {
                        id desiredStatus
                        runtime { ports { ip privatePort publicPort type } }
                    }
                }
            `, { id: node.providerNodeId });

            const pod = data?.pod;
            if (pod?.desiredStatus === "RUNNING" && pod?.runtime?.ports?.length) {
                const port46337 = pod.runtime.ports.find((p) => String(p.privatePort) === "46337");
                const endpointUrl = port46337?.ip && port46337?.publicPort
                    ? `http://${port46337.ip}:${port46337.publicPort}`
                    : null;
                return state.updateNode(node.id, { status: "running", endpointUrl });
            }
            await new Promise((r) => setTimeout(r, pollInterval));
        }

        await state.updateNode(node.id, {
            status: "error",
            error_log: `pod did not reach RUNNING within ${Math.round(timeoutMs / 1000)}s`
        });
        throw new Error(
            `RunPod pod ${node.providerNodeId} did not reach RUNNING within ${Math.round(timeoutMs / 1000)}s`
        );
    }

    async bootstrapNode(node, _request) {
        // The Infernet provider Docker image starts the daemon on boot,
        // so bootstrap is just a health-check on the published port.
        if (!node?.endpointUrl) {
            return { ok: false, reason: "no endpointUrl on node — call waitUntilReady first" };
        }
        const healthEndpoint = `${node.endpointUrl}/health`;
        try {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 5000);
            const res = await fetch(healthEndpoint, { signal: ctrl.signal });
            clearTimeout(t);
            return { ok: res.ok, healthEndpoint };
        } catch (err) {
            return { ok: false, reason: err?.message ?? String(err), healthEndpoint };
        }
    }

    async getNode(nodeId) {
        const local = await state.loadNode(nodeId);
        if (!local || local.provider !== "runpod") {
            throw new Error(`runpod: no local record for nodeId=${nodeId}`);
        }
        // Best-effort live status; ignore failures so the local record
        // is still returned.
        try {
            const data = await this._gql(`
                query pod($id: String!) {
                    pod(input: { podId: $id }) { id desiredStatus }
                }
            `, { id: local.providerNodeId });
            if (data?.pod?.desiredStatus) local.liveStatus = data.pod.desiredStatus;
        } catch { /* best-effort */ }
        return local;
    }

    async listNodes() {
        const all = await state.listNodes();
        return all.filter((n) => n.provider === "runpod");
    }

    async stopNode(nodeId) {
        const local = await state.loadNode(nodeId);
        if (!local || local.provider !== "runpod") {
            throw new Error(`runpod: no local record for nodeId=${nodeId}`);
        }
        await this._gql(`
            mutation stop($id: String!) {
                podStop(input: { podId: $id }) { id desiredStatus }
            }
        `, { id: local.providerNodeId });
        await state.updateNode(nodeId, { status: "stopped" });
        return { ok: true };
    }

    async startNode(nodeId) {
        const local = await state.loadNode(nodeId);
        if (!local || local.provider !== "runpod") {
            throw new Error(`runpod: no local record for nodeId=${nodeId}`);
        }
        await this._gql(`
            mutation start($id: String!, $count: Int!) {
                podResume(input: { podId: $id, gpuCount: $count }) { id desiredStatus }
            }
        `, { id: local.providerNodeId, count: local.gpuCount ?? 1 });
        await state.updateNode(nodeId, { status: "running" });
        return { ok: true };
    }

    async destroyNode(nodeId) {
        const local = await state.loadNode(nodeId);
        if (!local || local.provider !== "runpod") {
            throw new Error(`runpod: no local record for nodeId=${nodeId}`);
        }
        await this._gql(`
            mutation terminate($id: String!) { podTerminate(input: { podId: $id }) }
        `, { id: local.providerNodeId });
        await state.updateNode(nodeId, { status: "destroyed" });
        return { ok: true };
    }

    async logs(nodeId, _opts = {}) {
        const local = await state.loadNode(nodeId).catch(() => null);
        const dashUrl = local?.providerNodeId
            ? `https://www.runpod.io/console/pods/${local.providerNodeId}`
            : "https://www.runpod.io/console/pods";
        // RunPod's GraphQL API doesn't expose container stdout/stderr.
        // Throw NotSupportedError but augment the message with a useful link.
        const err = new NotSupportedError("logs", "runpod");
        err.message =
            `runpod: container logs are not exposed via the GraphQL API.\n` +
            `View logs at: ${dashUrl}`;
        throw err;
    }
}

export default RunPodProvider;
