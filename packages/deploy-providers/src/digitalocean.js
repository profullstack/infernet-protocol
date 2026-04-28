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
