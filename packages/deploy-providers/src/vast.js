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
