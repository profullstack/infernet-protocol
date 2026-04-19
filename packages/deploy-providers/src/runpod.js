/**
 * RunPod adapter — one-click deploy an Infernet provider pod.
 *
 * RunPod's public API is GraphQL at https://api.runpod.io/graphql. We
 * call it with the user's personal API key (never stored server-side;
 * passed through from the request and dropped). The pod boots with our
 * Docker image (see tooling/docker/provider/) which runs the infernet
 * CLI in --foreground mode.
 *
 * Environment variables handed to the pod:
 *   SUPABASE_URL               - control-plane Supabase URL
 *   SUPABASE_SERVICE_ROLE_KEY  - service-role key (scope: that project only)
 *   INFERNET_NODE_ROLE         - provider | aggregator (default: provider)
 *   INFERNET_NODE_NAME         - human-readable name for the dashboard
 *   INFERNET_P2P_PORT          - default 46337
 */

const API_URL = "https://api.runpod.io/graphql";
const DEFAULT_IMAGE = "ghcr.io/profullstack/infernet-provider:latest";

async function graphql({ apiKey, query, variables }) {
    const res = await fetch(`${API_URL}?api_key=${encodeURIComponent(apiKey)}`, {
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

/**
 * List GPU types available on RunPod. Normalized to our shape.
 */
export async function listGpuTypes(apiKey) {
    const data = await graphql({
        apiKey,
        query: `query gpuTypes {
            gpuTypes {
                id
                displayName
                memoryInGb
                communityPrice
                secureCloud
            }
        }`
    });
    const rows = data?.gpuTypes ?? [];
    return rows.map((g) => ({
        id: g.id,
        name: g.displayName,
        vramMb: Math.round((g.memoryInGb ?? 0) * 1024),
        pricePerHour: g.communityPrice ?? null,
        region: g.secureCloud ? "secure" : "community"
    }));
}

/**
 * Launch a pod that runs the Infernet provider image.
 *
 * @param {{
 *   apiKey: string,
 *   gpuTypeId: string,
 *   name: string,
 *   image?: string,
 *   env: Record<string, string>,
 *   containerDiskGb?: number,
 *   volumeInGb?: number,
 *   ports?: string,
 *   region?: string
 * }} opts
 */
export async function createDeployment(opts) {
    const {
        apiKey, gpuTypeId, name, image = DEFAULT_IMAGE, env,
        containerDiskGb = 20, volumeInGb = 0, ports = "46337/tcp"
    } = opts;

    if (!gpuTypeId) throw new Error("runpod: gpuTypeId is required");
    if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error("runpod: env must include SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
    }

    const envInput = Object.entries(env).map(([key, value]) => ({
        key, value: String(value)
    }));

    const data = await graphql({
        apiKey,
        query: `mutation create($input: PodFindAndDeployOnDemandInput!) {
            podFindAndDeployOnDemand(input: $input) {
                id
                desiredStatus
                imageName
                machineId
            }
        }`,
        variables: {
            input: {
                name,
                imageName: image,
                gpuTypeId,
                cloudType: "COMMUNITY",
                containerDiskInGb: containerDiskGb,
                volumeInGb,
                ports,
                env: envInput,
                dockerArgs: ""
            }
        }
    });

    const pod = data?.podFindAndDeployOnDemand;
    if (!pod?.id) throw new Error("runpod: create returned no pod id");
    return { deploymentId: pod.id, status: pod.desiredStatus, image: pod.imageName };
}

export async function getDeployment({ apiKey, deploymentId }) {
    const data = await graphql({
        apiKey,
        query: `query pod($id: String!) {
            pod(input: { podId: $id }) {
                id
                desiredStatus
                runtime { ports { ip privatePort publicPort type } }
            }
        }`,
        variables: { id: deploymentId }
    });
    const pod = data?.pod;
    if (!pod) return { status: "unknown" };
    const port = pod.runtime?.ports?.find((p) => String(p.privatePort) === "46337");
    return {
        status: pod.desiredStatus,
        endpoint: port?.ip && port?.publicPort ? `${port.ip}:${port.publicPort}` : null
    };
}

export async function destroyDeployment({ apiKey, deploymentId }) {
    await graphql({
        apiKey,
        query: `mutation terminate($id: String!) {
            podTerminate(input: { podId: $id })
        }`,
        variables: { id: deploymentId }
    });
    return { ok: true };
}
