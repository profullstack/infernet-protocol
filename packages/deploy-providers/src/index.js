/**
 * Deploy-provider registry.
 *
 * Two surfaces are exposed for backwards compatibility during the
 * IPIP-0019 rollout:
 *
 *   adapters       — legacy module-export shape (createDeployment,
 *                    getDeployment, destroyDeployment). Used by the
 *                    existing per-provider CLI commands. STABLE.
 *
 *   providers      — IPIP-0019 DeployProvider class registry. Each entry
 *                    is a class extending ./providers/base.js → instantiate
 *                    with `new providers.runpod({ apiKey })` and call
 *                    findOffers / createNode / waitUntilReady / etc.
 *                    Used by lifecycle commands and pricing-aware preset
 *                    dispatch. THIS IS THE FORWARD-LOOKING SURFACE.
 *
 * Adding a new provider:
 *   1. Drop packages/deploy-providers/src/providers/<id>.js exporting a
 *      class extending DeployProvider, with providerId === "<id>".
 *   2. Import + register it in the `providers` map below.
 *   3. Add it to PROVIDER_KEY_URLS so the CLI knows where to send users
 *      to mint an API key.
 *   4. Add reliability / dx scores in pricing.js so it participates in
 *      cross-provider ranking.
 *
 * Adapters are stateless w.r.t. credentials — they never persist the
 * user's cloud API key. The CLI / web layer passes the key through and
 * forgets it after the request.
 */

import * as runpod from "./runpod.js";
import * as digitalocean from "./digitalocean.js";
import * as vast from "./vast.js";

import { DeployProvider, NotSupportedError } from "./providers/base.js";
import RunPodProvider from "./providers/runpod.js";
import TensorDockProvider from "./providers/tensordock.js";
import LambdaProvider from "./providers/lambda.js";
import HyperstackProvider from "./providers/hyperstack.js";
import CrusoeProvider from "./providers/crusoe.js";
import DataCrunchProvider from "./providers/datacrunch.js";
import VoltageParkProvider from "./providers/voltagepark.js";
import { VastProvider } from "./vast.js";
import { DigitalOceanProvider } from "./digitalocean.js";

// ---- Legacy module-export adapters (stable, used by existing CLI) ----

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

export { runpod, digitalocean, vast };

// ---- IPIP-0019 DeployProvider class registry (forward-looking) ----

export const providers = {
    runpod:       RunPodProvider,
    tensordock:   TensorDockProvider,
    lambda:       LambdaProvider,
    hyperstack:   HyperstackProvider,
    crusoe:       CrusoeProvider,
    datacrunch:   DataCrunchProvider,
    voltagepark:  VoltageParkProvider,
    vast:         VastProvider,
    digitalocean: DigitalOceanProvider
};

/**
 * Instantiate a DeployProvider class by id. Throws if the id is unknown
 * or if the apiKey is missing.
 */
export function getProvider(id, config) {
    const Cls = providers[id];
    if (!Cls) {
        const known = Object.keys(providers).join(", ") || "(none registered)";
        throw new Error(`Unknown DeployProvider id: ${id}. Known: ${known}`);
    }
    return new Cls(config);
}

/** Provider ids that have a class implementation registered. */
export function listProviderIds() {
    return Object.keys(providers);
}

export {
    DeployProvider,
    NotSupportedError,
    RunPodProvider,
    TensorDockProvider,
    LambdaProvider,
    HyperstackProvider,
    CrusoeProvider,
    DataCrunchProvider,
    VoltageParkProvider,
    VastProvider,
    DigitalOceanProvider
};

// ---- Provider key URLs (where to mint an API key) ----

export const PROVIDER_KEY_URLS = {
    digitalocean: digitalocean.meta.keyUrl,
    vast:         vast.meta.keyUrl,
    runpod:       "https://www.runpod.io/console/user/settings",
    tensordock:   "https://dashboard.tensordock.com/api",
    lambda:       "https://cloud.lambdalabs.com/api-keys",
    hyperstack:   "https://infrahub.nexgencloud.com/dashboard/api-keys",
    crusoe:       "https://console.crusoecloud.com/security/tokens",
    datacrunch:   "https://cloud.datacrunch.io/account/api",
    voltagepark:  "https://dashboard.voltagepark.com/api-keys"
};
