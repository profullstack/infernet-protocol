/**
 * Lambda Cloud adapter — IPIP-0019 DeployProvider implementation.
 *
 * Lambda's REST API is at https://cloud.lambdalabs.com/api/v1/
 * Auth via HTTP Basic with the API key as the username (password empty).
 *
 * VM-based (not Docker). createNode launches an instance with a
 * pre-uploaded SSH key; bootstrapNode is currently a health-check stub
 * because Lambda's API doesn't expose cloud-init / user-data — operators
 * need to either bake a custom AMI or SSH-in to run the installer.
 *
 * If the operator passes `bootstrap: "ssh"`, bootstrapNode will execute
 * the installer via SSH (requires the matching private key on the local
 * machine — pass via INFERNET_LAMBDA_SSH_KEY_PATH).
 */

import { spawn } from "node:child_process";
import { DeployProvider, NotSupportedError } from "./base.js";
import { canonicalize, aliasesFor } from "../gpu-normalize.js";
import * as state from "../state.js";
import { composeInstallScript, pollVllmHealth } from "../vllm-bootstrap.js";

const API_BASE = "https://cloud.lambdalabs.com/api/v1";

const DEFAULT_INSTALLER =
    process.env.INFERNET_INSTALLER_URL
    ?? "https://infernetprotocol.com/install.sh";

export class LambdaProvider extends DeployProvider {
    constructor(config = {}) {
        super({ ...config, providerId: "lambda" });
        this._authHeader = "Basic " + Buffer.from(`${config.apiKey}:`).toString("base64");
    }

    async _request(method, path, body) {
        const res = await fetch(`${API_BASE}${path}`, {
            method,
            headers: {
                Authorization: this._authHeader,
                "Content-Type": "application/json"
            },
            body: body ? JSON.stringify(body) : undefined
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
            const msg = json?.error?.message ?? json?.message ?? res.statusText ?? `HTTP ${res.status}`;
            const err = new Error(`Lambda Cloud API error: ${msg}`);
            err.status = res.status;
            err.body = json;
            throw err;
        }
        return json?.data ?? json;
    }

    // ---- Discovery ----

    async validateAuth() {
        // Listing instances is the cheapest auth probe — empty list still
        // returns 200 with valid creds.
        await this._request("GET", "/instances");
        return { ok: true };
    }

    async listGpuTypes() {
        const types = await this._request("GET", "/instance-types");
        // Response shape: { "gpu_1x_a100": { instance_type: { name, description, ... } } }
        const out = [];
        const entries = Array.isArray(types) ? types : Object.entries(types);
        for (const entry of entries) {
            const [_id, val] = Array.isArray(entry) ? entry : [entry?.id ?? null, entry];
            const t = val?.instance_type ?? val;
            if (!t?.name) continue;
            out.push({
                id: t.name,
                name: t.description ?? t.name,
                vramGb: t?.specs?.gpus?.[0]?.memory_gib ?? null,
                pricePerHour: (t?.price_cents_per_hour ?? 0) / 100
            });
        }
        return out;
    }

    async listRegions() {
        const types = await this._request("GET", "/instance-types");
        const regions = new Set();
        const entries = Array.isArray(types) ? types : Object.entries(types);
        for (const entry of entries) {
            const [_id, val] = Array.isArray(entry) ? entry : [null, entry];
            const r = val?.regions_with_capacity_available ?? [];
            for (const reg of r) regions.add(reg.name ?? reg);
        }
        return [...regions].map((r) => ({ id: r, name: r }));
    }

    async findOffers(request = {}) {
        const types = await this._request("GET", "/instance-types");
        const wantCanonical = request.gpu ? canonicalize(request.gpu) : null;
        const aliases = wantCanonical
            ? [wantCanonical, ...aliasesFor(wantCanonical)].map((a) => a.toLowerCase())
            : null;

        const offers = [];
        const entries = Array.isArray(types) ? types : Object.entries(types);
        for (const entry of entries) {
            const [_id, val] = Array.isArray(entry) ? entry : [null, entry];
            const t = val?.instance_type ?? val;
            const regionsAvail = val?.regions_with_capacity_available ?? [];
            if (!t?.name) continue;

            const desc = (t.description ?? t.name).toLowerCase();
            if (aliases && !aliases.some((a) => desc.includes(a))) continue;

            const vramGb = t?.specs?.gpus?.[0]?.memory_gib ?? 0;
            if (request.vramMin && vramGb < request.vramMin) continue;

            const pricePerHour = (t?.price_cents_per_hour ?? 0) / 100;
            if (request.maxPricePerHour != null && pricePerHour > request.maxPricePerHour) continue;

            for (const reg of regionsAvail) {
                if (request.region && (reg.name ?? reg) !== request.region) continue;
                offers.push({
                    providerId: "lambda",
                    offerId: `${t.name}@${reg.name ?? reg}`,
                    gpu: {
                        name: t.description ?? t.name,
                        count: t?.specs?.gpus?.length ?? 1,
                        vramGb
                    },
                    cpu: t?.specs?.vcpus ? { cores: t.specs.vcpus } : undefined,
                    ramGb: t?.specs?.memory_gib ?? undefined,
                    diskGb: t?.specs?.storage_gib ?? undefined,
                    region: reg.name ?? reg,
                    pricePerHour,
                    deployStyle: "vm-ssh",
                    available: true,
                    raw: { instance_type_name: t.name, region: reg.name ?? reg, instance_type: t }
                });
            }
        }
        return offers;
    }

    // ---- Lifecycle ----

    async createNode(request = {}) {
        const {
            gpu, gpuCount = 1, name, region, instanceTypeName,
            sshKeyNames, fileSystemNames = [],
            env = {}, controlPlaneUrl = "", engine = "ollama", model = null,
            hourlyPrice = 0, vramGb = 0
        } = request;

        if (!sshKeyNames || sshKeyNames.length === 0) {
            throw new Error(
                "lambda: createNode requires sshKeyNames (upload a key first via /api/v1/ssh-keys " +
                "or the Lambda dashboard, then pass [\"key-name\"])"
            );
        }

        // Resolve instance type from canonical GPU if not given explicitly.
        const finalType = instanceTypeName ?? await this._pickInstanceType({ gpu, region });
        if (!finalType) {
            throw new Error(`lambda: no instance type matched gpu="${gpu}" in region="${region ?? "any"}"`);
        }

        const finalRegion = region ?? await this._pickRegion(finalType);
        if (!finalRegion) {
            throw new Error(`lambda: no region with capacity for instance type "${finalType}"`);
        }

        const localId = state.generateNodeId();
        const vmName = name ?? localId;

        const data = await this._request("POST", "/instance-operations/launch", {
            region_name: finalRegion,
            instance_type_name: finalType,
            ssh_key_names: sshKeyNames,
            file_system_names: fileSystemNames,
            quantity: gpuCount > 1 ? 1 : 1, // Lambda's "quantity" is # of instances, not GPUs
            name: vmName
            // Note: Lambda's launch API does NOT accept a user-data /
            // cloud-init field. Bootstrap happens post-launch via SSH.
        });

        const ids = data?.instance_ids ?? [];
        const vmId = ids[0];
        if (!vmId) throw new Error("lambda: launch returned no instance id");

        const record = {
            id: localId,
            provider: "lambda",
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
            controlPlaneUrl,
            envForBootstrap: {
                INFERNET_NODE_NAME: vmName,
                INFERNET_CONTROL_PLANE_URL: controlPlaneUrl,
                INFERNET_ENGINE: engine,
                ...(model ? { INFERNET_MODEL: model } : {}),
                ...env
            },
            sshKeyNames
        };
        await state.saveNode(record);
        return record;
    }

    async _pickInstanceType({ gpu, region }) {
        const offers = await this.findOffers({ gpu, region });
        if (offers.length === 0) return null;
        offers.sort((a, b) => a.pricePerHour - b.pricePerHour);
        return offers[0].raw?.instance_type_name ?? null;
    }

    async _pickRegion(typeName) {
        const types = await this._request("GET", "/instance-types");
        const entries = Array.isArray(types) ? types : Object.entries(types);
        for (const entry of entries) {
            const [_id, val] = Array.isArray(entry) ? entry : [null, entry];
            const t = val?.instance_type ?? val;
            if (t?.name !== typeName) continue;
            const regs = val?.regions_with_capacity_available ?? [];
            return regs[0]?.name ?? regs[0] ?? null;
        }
        return null;
    }

    async waitUntilReady(node, timeoutMs = 5 * 60 * 1000) {
        if (!node?.providerNodeId) {
            throw new Error("lambda: waitUntilReady requires node.providerNodeId");
        }
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const inst = await this._request("GET", `/instances/${node.providerNodeId}`);
            const status = (inst?.status ?? "").toLowerCase();
            if (status === "active" || status === "running") {
                const ip = inst?.ip ?? null;
                const endpointUrl = ip ? `http://${ip}:46337` : null;
                return state.updateNode(node.id, { status: "running", endpointUrl, ip });
            }
            await new Promise((r) => setTimeout(r, 5000));
        }
        await state.updateNode(node.id, {
            status: "error",
            error_log: `instance did not reach ACTIVE within ${Math.round(timeoutMs / 1000)}s`
        });
        throw new Error(
            `Lambda instance ${node.providerNodeId} did not reach ACTIVE within ${Math.round(timeoutMs / 1000)}s`
        );
    }

    async bootstrapNode(node, request = {}) {
        // Lambda doesn't take cloud-init, so bootstrap must SSH in. We do
        // it ourselves only if the operator explicitly opts in via
        // request.bootstrap === "ssh" AND has the matching private key
        // on disk (path via env or request.sshKeyPath).
        if (request.bootstrap !== "ssh") {
            return {
                ok: false,
                reason:
                    "lambda: cloud-init is not supported by Lambda's API. " +
                    "Pass { bootstrap: 'ssh' } and provide sshKeyPath (or set " +
                    "INFERNET_LAMBDA_SSH_KEY_PATH) to run the installer over SSH, " +
                    "or pre-bake an AMI with the Infernet daemon installed."
            };
        }
        if (!node?.ip) {
            return { ok: false, reason: "no node.ip — call waitUntilReady first" };
        }
        const sshKeyPath = request.sshKeyPath ?? process.env.INFERNET_LAMBDA_SSH_KEY_PATH;
        if (!sshKeyPath) {
            return { ok: false, reason: "ssh bootstrap requested but no sshKeyPath" };
        }

        // Build the remote command. For vLLM, swap to the shared
        // composeInstallScript so the install + systemd unit + Infernet
        // daemon are all set up consistently with the cloud-init providers.
        let remoteCmd;
        if ((request.engine ?? node.engine) === "vllm") {
            const script = composeInstallScript({
                infernetEnv: node.envForBootstrap ?? {},
                vllmConfig: { model: node.model, ...(request.vllm ?? {}) }
            });
            // Pipe the script to bash via stdin to avoid quoting issues.
            remoteCmd = `cat <<'INFERNET_BOOTSTRAP_EOF' | sudo bash -s\n${script}\nINFERNET_BOOTSTRAP_EOF`;
        } else {
            const envExports = Object.entries(node.envForBootstrap ?? {})
                .map(([k, v]) => `export ${k}=${JSON.stringify(String(v))}`)
                .join("\n");
            remoteCmd = [
                "set -eux",
                envExports,
                `curl -fsSL ${DEFAULT_INSTALLER} | bash`,
                "infernet register || true",
                "infernet start || true"
            ].join(" && ");
        }

        const code = await new Promise((resolve, reject) => {
            const args = [
                "-i", sshKeyPath,
                "-o", "StrictHostKeyChecking=no",
                "-o", "UserKnownHostsFile=/dev/null",
                `ubuntu@${node.ip}`,
                remoteCmd
            ];
            const child = spawn("ssh", args, { stdio: "inherit" });
            child.on("exit", resolve);
            child.on("error", reject);
        });
        if (code !== 0) {
            return { ok: false, reason: `ssh bootstrap exited ${code}` };
        }

        // Health-check: vLLM polls /v1/models, otherwise daemon /health.
        if ((request.engine ?? node.engine) === "vllm") {
            return pollVllmHealth(node.ip, { port: request.vllm?.port ?? 8000 });
        }
        const healthEndpoint = `${node.endpointUrl}/health`;
        try {
            const ctrl = new AbortController();
            setTimeout(() => ctrl.abort(), 5000);
            const res = await fetch(healthEndpoint, { signal: ctrl.signal });
            return { ok: res.ok, healthEndpoint };
        } catch (err) {
            return { ok: false, reason: err?.message ?? String(err), healthEndpoint };
        }
    }

    async getNode(nodeId) {
        const local = await state.loadNode(nodeId);
        if (!local || local.provider !== "lambda") {
            throw new Error(`lambda: no local record for nodeId=${nodeId}`);
        }
        try {
            const inst = await this._request("GET", `/instances/${local.providerNodeId}`);
            if (inst?.status) local.liveStatus = inst.status;
        } catch { /* best-effort */ }
        return local;
    }

    async listNodes() {
        const all = await state.listNodes();
        return all.filter((n) => n.provider === "lambda");
    }

    async stopNode(_nodeId) {
        // Lambda doesn't support pausing instances — only terminate. Be honest.
        throw new NotSupportedError(
            "stopNode",
            "lambda"
        );
    }

    async startNode(_nodeId) {
        throw new NotSupportedError(
            "startNode",
            "lambda"
        );
    }

    async destroyNode(nodeId) {
        const local = await state.loadNode(nodeId);
        if (!local || local.provider !== "lambda") {
            throw new Error(`lambda: no local record for nodeId=${nodeId}`);
        }
        await this._request("POST", "/instance-operations/terminate", {
            instance_ids: [local.providerNodeId]
        });
        await state.updateNode(nodeId, { status: "destroyed" });
        return { ok: true };
    }

    async logs(nodeId, _opts = {}) {
        const local = await state.loadNode(nodeId).catch(() => null);
        const err = new NotSupportedError("logs", "lambda");
        const sshHint = local?.ip
            ? `\nSSH and tail the daemon log:\n  ssh ubuntu@${local.ip} 'tail -200 /var/log/infernet/daemon.log'`
            : "";
        err.message =
            `lambda: instance logs are not exposed via the API.\n` +
            `View at: https://cloud.lambdalabs.com/instances` + sshHint;
        throw err;
    }
}

export default LambdaProvider;
