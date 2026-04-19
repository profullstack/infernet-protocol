/**
 * Deploy-provider registry.
 *
 * Each adapter implements:
 *   listGpuTypes(apiKey) -> Promise<Array<{ id, name, vramMb, pricePerHour, region? }>>
 *   createDeployment({ apiKey, gpuTypeId, env, name, region? }) -> Promise<{ deploymentId, status, endpoint? }>
 *   getDeployment({ apiKey, deploymentId }) -> Promise<{ status, endpoint?, logs? }>
 *   destroyDeployment({ apiKey, deploymentId }) -> Promise<{ ok: true }>
 *
 * All adapters are stateless — they never persist the user's cloud API
 * key. The web layer proxies the call and immediately forgets the key.
 */

import * as runpod from "./runpod.js";

export const adapters = {
    runpod
};

export function getAdapter(name) {
    const adapter = adapters[name];
    if (!adapter) throw new Error(`Unknown deploy adapter: ${name}`);
    return adapter;
}

export { runpod };
