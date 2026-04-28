/**
 * Deploy-provider registry.
 *
 * Each adapter implements (or partially implements):
 *   meta              — { id, label, keyUrl, sizesDoc, regionsDoc }
 *   listGpuTypes      — (apiKey) → catalog of available GPU types
 *   searchOffers      — (apiKey, criteria) → marketplace results (Vast.ai)
 *   createDeployment  — (apiKey, …) → { deploymentId, status, endpoint }
 *   getDeployment     — (apiKey, deploymentId) → { status, endpoint }
 *   destroyDeployment — (apiKey, deploymentId) → { ok }
 *
 * All adapters are stateless — they never persist the user's cloud
 * API key. The CLI / web layer passes the key through and forgets it.
 */

import * as runpod from "./runpod.js";
import * as digitalocean from "./digitalocean.js";
import * as vast from "./vast.js";

export const adapters = {
    runpod,
    digitalocean,
    vast
};

export function getAdapter(name) {
    const adapter = adapters[name];
    if (!adapter) throw new Error(`Unknown deploy adapter: ${name}`);
    return adapter;
}

export const PROVIDER_KEY_URLS = {
    digitalocean: digitalocean.meta.keyUrl,
    vast: vast.meta.keyUrl,
    runpod: "https://www.runpod.io/console/user/settings"
};

export { runpod, digitalocean, vast };
