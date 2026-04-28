/**
 * Deep-link generators for one-click pod deploys.
 *
 * Each provider exposes its own URL scheme for "open the deploy form
 * with these env vars pre-filled." We generate one URL per provider
 * given a freshly-minted INFERNET_BEARER + the operator's chosen
 * model. The user clicks once, lands on the provider's deploy page
 * with everything filled in, and just hits "Deploy."
 *
 * Bearer in URL is acceptable security here: 24h TTL, scoped to
 * deploy provisioning only, the destination IS the deploy form.
 * Don't reuse the URL once the pod is launched.
 */

/**
 * RunPod console template URL with env vars baked in.
 *
 * Format (per RunPod's docs):
 *   https://runpod.io/console/deploy?template=<id>&env[KEY]=value
 *
 * Returns null when no template ID is configured — caller should
 * hide the button instead of rendering a broken link.
 */
export function buildRunpodDeployUrl({
    templateId,
    bearer,
    model,
    nodeName,
    controlPlane
}) {
    if (!templateId) return null;
    const params = new URLSearchParams();
    params.set("template", templateId);
    if (bearer) params.set("env[INFERNET_BEARER]", bearer);
    if (model) params.set("env[INFERNET_MODEL]", model);
    if (nodeName) params.set("env[INFERNET_NODE_NAME]", nodeName);
    if (controlPlane) params.set("env[INFERNET_CONTROL_PLANE]", controlPlane);
    // RunPod's URLSearchParams encoding handles the brackets; their
    // form parser unescapes them on the other side.
    return `https://runpod.io/console/deploy?${params.toString()}`;
}

/**
 * DigitalOcean Droplet creation deep link with cloud-init pre-filled.
 *
 * DO's cloud config URL accepts a `user_data` query param. We point
 * at our own /api/deploy/cloud-init?token=<bearer> so the bearer
 * never appears in a URL the operator might paste — only the
 * cloud-init URL does, and that URL is single-use'd by DO at boot.
 *
 * Returns the DO marketplace URL when configured, or null.
 */
export function buildDigitalOceanDeployUrl({ cloudInitUrl, region = "nyc3", size = "g-2vcpu-8gb" }) {
    if (!cloudInitUrl) return null;
    // DigitalOcean's "create droplet" deep link accepts a userdata URL.
    // Format inferred from their marketplace pattern.
    const params = new URLSearchParams({
        region,
        size,
        userdata: cloudInitUrl
    });
    return `https://cloud.digitalocean.com/droplets/new?${params.toString()}`;
}
