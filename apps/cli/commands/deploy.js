/**
 * `infernet deploy` — provision an Infernet node on a cloud provider.
 *
 * Subcommands:
 *   up          Create a node on a chosen provider (default if none given)
 *   auth set    Save a provider API key to local config
 *   auth list   Show configured providers (keys masked)
 *   auth where  Print the URL where you get a key for a provider
 *   auth remove Remove a provider's key from config
 *
 * Credentials live in ~/.config/infernet/config.json under
 *   cloudCredentials.{provider} = "<api-key>"
 * (mode 0600). Env vars override config: DO_TOKEN, VAST_API_KEY,
 * RUNPOD_API_KEY.
 *
 * The cloud-init payload is the same one the /deploy page uses — we
 * mint a 24h CLI bearer if the operator is logged in, then point
 * cloud-init at /api/deploy/cloud-init?token=… so the new box
 * registers itself to the operator's account on first boot.
 */

import { loadConfig, saveConfig } from "../lib/config.js";
import { question } from "../lib/prompt.js";
import { getAdapter, adapters, PROVIDER_KEY_URLS } from "@infernetprotocol/deploy-providers";
import { canonicalize } from "@infernetprotocol/deploy-providers/gpu-normalize";
import { rankOffers, costBlock, isValidPreset } from "@infernetprotocol/deploy-providers/pricing";
import { formatFitWarning } from "@infernetprotocol/deploy-providers/model-fit";

const PROVIDERS = Object.keys(adapters);
const PRESET_NAMES = ["cheap", "balanced", "reliable", "production"];

export const USAGE = `infernet deploy [up|auth|cheap|balanced|reliable|production] [flags]

Provision an Infernet node on a cloud provider.

  infernet deploy auth set <provider> [<key>]
      Save a provider API key. Prompts (and shows the URL to get one)
      if <key> is omitted. Provider ∈ ${PROVIDERS.join(", ")}.

  infernet deploy auth list
      Show which providers have keys configured (keys masked).

  infernet deploy auth where <provider>
      Print the URL to obtain an API key for <provider>.

  infernet deploy auth remove <provider>
      Forget a provider's stored key.

  infernet deploy up --provider <name> [provider-specific flags]
      Create an Infernet node on the chosen provider. Uses the stored
      API key (or env: DO_TOKEN / VAST_API_KEY / RUNPOD_API_KEY).

      DigitalOcean flags:
        --size <slug>            e.g. gpu-h100x1-80gb, s-1vcpu-1gb
        --region <slug>          e.g. sfo3, nyc3
        --ssh-key-id <id>        DO ssh key ID (repeatable)
        --image <slug>           override image (default: gpu-h100x1-base for GPU)
        --name <name>            droplet name (default: infernet-<rand>)

      Vast.ai flags:
        --gpu <name>             e.g. "RTX 4090", "A100", "H100"
        --num-gpus <n>           default 1
        --max-price <usd/hr>     cap on $/hr
        --offer-id <id>          skip search; use this offer directly
        --disk-gb <n>            default 40

      RunPod flags:
        --gpu-type <id>          GPU type id (use the dashboard for now)

  infernet deploy up
      Equivalent to '... up' — sub-subcommand can be omitted.

  Common flags (all 'up' commands):
    --bearer <jwt>     CLI bearer for cloud-init (else mints from session)
    --model <name>     auto-pulled model (default: qwen2.5:7b)
    --dry-run          print the API call without sending it

Pricing-aware presets — compare across all configured providers and
pick the best fit per IPIP-0019 weights. --gpu is required;
--max-price caps the candidate set.

  infernet deploy cheap      --gpu 4090         --max-price 0.40
  infernet deploy balanced   --gpu a100-80gb    --max-price 2.00
  infernet deploy reliable   --gpu h100         --max-price 4.25
  infernet deploy production --gpu h100         --max-price 5.00

  Add --dry-run to see the comparison table + cost block without spending.
  Add --model <hf-id> to get a model-fit warning before deploy.
  Add --strict-model-fit to refuse deploy if the model won't fit.
`;

export default async function deploy(args) {
    const sub = args.positional?.[0] ?? "up";

    if (sub === "auth") return authSubcommand(args);
    if (sub === "up" || sub === undefined) return upSubcommand(args);
    // Pricing-aware presets — pick the best provider across all
    // configured clouds based on weights from IPIP-0019.
    if (PRESET_NAMES.includes(sub)) return presetSubcommand(sub, args);
    if (sub === "help" || args.has("help")) {
        process.stdout.write(USAGE + "\n");
        return 0;
    }
    process.stderr.write(`Unknown deploy subcommand: ${sub}\n${USAGE}\n`);
    return 1;
}

// ---- auth ---------------------------------------------------------------

async function authSubcommand(args) {
    const action = args.positional?.[1];
    const provider = args.positional?.[2];

    if (action === "set") return authSet(provider, args.positional?.[3], args);
    if (action === "list") return authList();
    if (action === "where") return authWhere(provider);
    if (action === "remove") return authRemove(provider);

    process.stderr.write(`Usage:\n  infernet deploy auth [set|list|where|remove] [provider]\n`);
    return 1;
}

async function authSet(provider, keyArg, args) {
    if (!isValidProvider(provider)) {
        process.stderr.write(`Provider must be one of: ${PROVIDERS.join(", ")}\n`);
        return 1;
    }
    let key = keyArg;
    if (!key) {
        const url = PROVIDER_KEY_URLS[provider];
        process.stdout.write(`\nGet a ${provider} API key from:\n  ${url}\n\n`);
        key = await question(`Paste your ${provider} API key`, { default: null, secret: true });
        if (!key) {
            process.stderr.write("No key entered — aborting.\n");
            return 1;
        }
    }
    const config = (await loadConfig()) ?? {};
    config.cloudCredentials = { ...(config.cloudCredentials ?? {}), [provider]: key };
    await saveConfig(config);
    process.stdout.write(`✓ saved ${provider} key to ~/.config/infernet/config.json (mode 0600)\n`);
    return 0;
}

async function authList() {
    const config = (await loadConfig()) ?? {};
    const creds = config.cloudCredentials ?? {};
    if (Object.keys(creds).length === 0) {
        process.stdout.write("No cloud credentials configured.\n");
        process.stdout.write(`Run: infernet deploy auth set <provider>\n`);
        process.stdout.write(`Providers: ${PROVIDERS.join(", ")}\n`);
        return 0;
    }
    process.stdout.write("Configured cloud credentials:\n");
    for (const [provider, key] of Object.entries(creds)) {
        const masked = key.length > 8 ? `${key.slice(0, 4)}…${key.slice(-4)}` : "***";
        const envVar = ENV_FOR_PROVIDER[provider];
        const envPresent = envVar && process.env[envVar];
        process.stdout.write(`  ${provider.padEnd(14)} ${masked}${envPresent ? ` (env ${envVar} also set)` : ""}\n`);
    }
    return 0;
}

async function authWhere(provider) {
    if (!isValidProvider(provider)) {
        process.stderr.write(`Provider must be one of: ${PROVIDERS.join(", ")}\n`);
        return 1;
    }
    process.stdout.write(`${PROVIDER_KEY_URLS[provider]}\n`);
    return 0;
}

async function authRemove(provider) {
    if (!isValidProvider(provider)) {
        process.stderr.write(`Provider must be one of: ${PROVIDERS.join(", ")}\n`);
        return 1;
    }
    const config = (await loadConfig()) ?? {};
    if (!config.cloudCredentials?.[provider]) {
        process.stdout.write(`No ${provider} key was configured.\n`);
        return 0;
    }
    delete config.cloudCredentials[provider];
    await saveConfig(config);
    process.stdout.write(`✓ removed ${provider} key\n`);
    return 0;
}

// ---- up -----------------------------------------------------------------

const ENV_FOR_PROVIDER = {
    digitalocean: "DO_TOKEN",
    vast: "VAST_API_KEY",
    runpod: "RUNPOD_API_KEY"
};

async function upSubcommand(args) {
    const provider = args.get("provider");
    if (!isValidProvider(provider)) {
        process.stderr.write(
            `--provider <name> required. Choices: ${PROVIDERS.join(", ")}\n` +
            `If you don't have an API key yet, run:\n` +
            `  infernet deploy auth where <provider>\n` +
            `  infernet deploy auth set <provider>\n`
        );
        return 1;
    }

    const apiKey = await resolveApiKey(provider);
    if (!apiKey) {
        const url = PROVIDER_KEY_URLS[provider];
        const env = ENV_FOR_PROVIDER[provider];
        process.stderr.write(
            `No ${provider} API key found. Get one at:\n  ${url}\n\n` +
            `Then either:\n` +
            `  infernet deploy auth set ${provider}\n` +
            `  # or export it:\n` +
            `  export ${env}=<key>\n`
        );
        return 1;
    }

    const userData = await buildUserData(args);
    if (!userData) return 1;

    if (args.has("dry-run")) {
        process.stdout.write(`# DRY RUN — would create a ${provider} deployment with user_data:\n`);
        process.stdout.write(userData + "\n");
        return 0;
    }

    const adapter = getAdapter(provider);
    try {
        if (provider === "digitalocean") return await runDoUp(adapter, apiKey, userData, args);
        if (provider === "vast")          return await runVastUp(adapter, apiKey, userData, args);
        if (provider === "runpod")        return await runRunpodUp(adapter, apiKey, userData, args);
    } catch (err) {
        process.stderr.write(`Deploy failed: ${err?.message ?? err}\n`);
        if (err?.body) process.stderr.write(`  ${JSON.stringify(err.body).slice(0, 400)}\n`);
        return 1;
    }
    return 1;
}

async function runDoUp(adapter, apiKey, userData, args) {
    const name = args.get("name") ?? `infernet-${Math.random().toString(36).slice(2, 8)}`;
    const size = args.get("size") ?? "gpu-h100x1-80gb";
    const region = args.get("region") ?? "sfo3";
    const image = args.get("image");
    const sshKeyIds = (args.getAll?.("ssh-key-id") ?? [])
        .map((s) => Number.parseInt(s, 10))
        .filter(Number.isFinite);

    process.stdout.write(`Creating DigitalOcean droplet "${name}" (${size}, ${region})...\n`);
    const result = await adapter.createDeployment({
        apiKey, name, size, region, image, sshKeyIds, userData
    });
    process.stdout.write(`✓ droplet created (id=${result.deploymentId}, status=${result.status})\n`);
    process.stdout.write(`  IP not yet assigned — poll: doctl compute droplet get ${result.deploymentId}\n`);
    process.stdout.write(`  Or wait ~30s and run: infernet status (the node will register itself)\n`);
    return 0;
}

async function runVastUp(adapter, apiKey, userData, args) {
    let offerId = args.get("offer-id");
    if (!offerId) {
        const gpuName = args.get("gpu") ?? "RTX 4090";
        const numGpus = Number.parseInt(args.get("num-gpus") ?? "1", 10);
        const maxPrice = args.get("max-price") ? Number.parseFloat(args.get("max-price")) : null;
        process.stdout.write(`Searching Vast.ai offers (gpu=${gpuName}, num=${numGpus}${maxPrice ? `, ≤$${maxPrice}/hr` : ""})...\n`);
        const offers = await adapter.searchOffers({ apiKey, gpuName, numGpus, maxPrice });
        if (offers.length === 0) {
            process.stderr.write(`No matching offers. Try --max-price higher or different --gpu.\n`);
            return 1;
        }
        const cheapest = offers[0];
        offerId = cheapest.id;
        process.stdout.write(`Picked cheapest offer: id=${offerId}, ${cheapest.gpuName} x${cheapest.numGpus}, $${cheapest.pricePerHour}/hr (${cheapest.region ?? "?"})\n`);
    }
    const diskGb = Number.parseInt(args.get("disk-gb") ?? "40", 10);
    const result = await adapter.createDeployment({ apiKey, offerId, userData, diskGb });
    process.stdout.write(`✓ Vast.ai instance created (id=${result.deploymentId}, status=${result.status})\n`);
    process.stdout.write(`  Watch at: https://cloud.vast.ai/instances/\n`);
    return 0;
}

async function runRunpodUp(adapter, apiKey, userData, args) {
    // RunPod adapter signature predates this CLI; thread userData through env.
    const gpuTypeId = args.get("gpu-type");
    if (!gpuTypeId) {
        process.stderr.write(`RunPod requires --gpu-type. Browse at https://www.runpod.io/console/pods\n`);
        return 1;
    }
    const name = args.get("name") ?? `infernet-${Math.random().toString(36).slice(2, 8)}`;
    const result = await adapter.createDeployment({
        apiKey,
        gpuTypeId,
        name,
        env: { INFERNET_USER_DATA: userData }
    });
    process.stdout.write(`✓ RunPod pod created (id=${result.deploymentId}, status=${result.status})\n`);
    return 0;
}

// ---- pricing-aware preset dispatch (cheap / balanced / reliable / production) ----

async function presetSubcommand(presetName, args) {
    if (!isValidPreset(presetName)) {
        process.stderr.write(`Unknown preset: ${presetName}\n`);
        return 1;
    }

    const requestedGpu = args.get("gpu");
    if (!requestedGpu) {
        process.stderr.write(
            `--gpu <name> is required for preset deploys.\n` +
            `Examples: --gpu 4090, --gpu a100-80gb, --gpu h100\n`
        );
        return 1;
    }
    const canonicalGpu = canonicalize(requestedGpu);
    if (!canonicalGpu) {
        process.stderr.write(
            `Unknown GPU: ${requestedGpu}\n` +
            `Try a canonical name (4090, a100-80gb, h100, etc.).\n`
        );
        return 1;
    }
    const maxPrice = args.get("max-price")
        ? Number.parseFloat(args.get("max-price"))
        : null;

    process.stdout.write(`Searching providers (preset=${presetName}, gpu=${canonicalGpu}${maxPrice ? `, ≤$${maxPrice}/hr` : ""})...\n\n`);

    // Query each configured provider's offers in parallel.
    const offers = await collectOffersAcrossProviders({
        canonicalGpu,
        maxPrice,
        request: {
            gpu: canonicalGpu,
            gpuCount: Number.parseInt(args.get("gpu-count") ?? "1", 10) || 1,
            vramMin: args.get("vram-min") ? Number.parseInt(args.get("vram-min"), 10) : null,
            region: args.get("region") ?? null,
            maxPricePerHour: maxPrice
        }
    });

    if (offers.length === 0) {
        process.stderr.write(
            `No matching offers found across configured providers.\n\n` +
            `Try:\n` +
            `  - increase --max-price\n` +
            `  - drop --region\n` +
            `  - use a different --gpu (try infernet deploy auth list to see configured providers)\n`
        );
        return 1;
    }

    // Rank by preset weights.
    const ranked = rankOffers(offers, presetName, { maxPricePerHour: maxPrice });
    if (ranked.length === 0) {
        process.stderr.write("All offers excluded after applying max-price / availability filters.\n");
        return 1;
    }

    // Print comparison table.
    process.stdout.write("Provider       GPU                  Price        Region    Score\n");
    process.stdout.write("─────────────  ───────────────────  ───────────  ────────  ─────\n");
    for (const o of ranked.slice(0, 8)) {
        const provider = String(o.providerId).padEnd(13);
        const gpuLabel = `${o.gpu?.name ?? canonicalGpu} ×${o.gpu?.count ?? 1}`.padEnd(19);
        const price = `$${o.pricePerHour.toFixed(2)}/hr`.padEnd(11);
        const region = String(o.region ?? "-").padEnd(8);
        process.stdout.write(`${provider}  ${gpuLabel}  ${price}  ${region}  ${o.score.toFixed(3)}\n`);
    }
    process.stdout.write("\n");

    const winner = ranked[0];
    const cost = costBlock(winner.pricePerHour);
    process.stdout.write(`Selected: ${winner.providerId} (score=${winner.score.toFixed(3)})\n`);
    process.stdout.write(`Estimated cost: ${cost.hourly}, ${cost.daily}, ${cost.monthly}\n\n`);

    // Model-fit check before spending money.
    const model = args.get("model");
    if (model) {
        const warning = formatFitWarning({
            modelId: model,
            quantization: args.get("quantization") ?? "none",
            vramGb: winner.gpu?.vramGb ?? 24,
            gpuCount: winner.gpu?.count ?? 1,
            gpuName: winner.gpu?.name ?? canonicalGpu
        });
        if (warning) {
            process.stdout.write(warning + "\n\n");
            if (args.has("strict-model-fit")) {
                process.stderr.write("--strict-model-fit set — refusing to deploy.\n");
                return 1;
            }
        }
    }

    if (args.has("dry-run")) {
        process.stdout.write("Dry run only. No node was created.\n");
        return 0;
    }

    if (!args.has("yes")) {
        const ans = await question(`Continue with deploy on ${winner.providerId}?`, { default: "n" });
        if (!/^y/i.test(ans)) {
            process.stdout.write("Aborted.\n");
            return 0;
        }
    }

    // Hand off to the per-provider up-flow with the chosen offer pre-filled.
    const provArgs = makeProviderArgsFromOffer(winner, args);
    return upSubcommand(provArgs);
}

async function collectOffersAcrossProviders({ canonicalGpu, maxPrice, request }) {
    const config = (await loadConfig()) ?? {};
    const offers = [];
    for (const provider of PROVIDERS) {
        const apiKey = await resolveApiKey(provider);
        if (!apiKey) continue; // skip unconfigured
        const adapter = adapters[provider];
        const fn = adapter?.findOffers ?? adapter?.searchOffers;
        if (typeof fn !== "function") continue; // adapter doesn't support discovery yet
        try {
            const found = await fn({ apiKey, ...request });
            for (const o of found ?? []) {
                offers.push({
                    providerId: provider,
                    offerId: o.id ?? o.offerId,
                    gpu: o.gpu ?? { name: o.gpuName ?? canonicalGpu, count: o.numGpus ?? 1, vramGb: o.vramGb ?? 0 },
                    region: o.region ?? null,
                    pricePerHour: o.pricePerHour ?? o.dph_total ?? 0,
                    available: o.available ?? true,
                    raw: o
                });
            }
        } catch (err) {
            process.stderr.write(`  (${provider}: ${err?.message ?? err})\n`);
        }
    }
    return offers;
}

function makeProviderArgsFromOffer(offer, parentArgs) {
    // Build a minimal "args"-shaped object that upSubcommand consumes.
    // Forwards relevant flags + injects --provider and --offer-id.
    const flags = new Map();
    flags.set("provider", [offer.providerId]);
    if (offer.offerId) flags.set("offer-id", [String(offer.offerId)]);
    const passthrough = ["model", "engine", "name", "size", "region", "ssh-key-id", "image", "yes", "dry-run", "max-price", "gpu", "gpu-count"];
    for (const k of passthrough) {
        if (parentArgs.has?.(k)) {
            const v = parentArgs.get(k);
            flags.set(k, v === undefined ? [true] : [v]);
        }
    }
    return {
        positional: ["up"],
        has(k) { return flags.has(k); },
        get(k) {
            const v = flags.get(k);
            if (!v) return undefined;
            return v[0] === true ? undefined : v[0];
        },
        getAll(k) { return (flags.get(k) ?? []).filter((x) => x !== true); }
    };
}

// ---- helpers ------------------------------------------------------------

function isValidProvider(p) {
    return typeof p === "string" && PROVIDERS.includes(p);
}

async function resolveApiKey(provider) {
    const envVar = ENV_FOR_PROVIDER[provider];
    if (envVar && process.env[envVar]) return process.env[envVar];
    const config = (await loadConfig()) ?? {};
    return config?.cloudCredentials?.[provider] ?? null;
}

async function buildUserData(args) {
    const explicit = args.get("bearer");
    if (explicit) return buildOneliner(explicit, args);

    const config = (await loadConfig()) ?? {};
    const sessionBearer = config?.auth?.bearerToken;
    if (!sessionBearer) {
        process.stderr.write(
            `No CLI bearer found. Either pass --bearer <jwt>, or run\n` +
            `  infernet login\n` +
            `first to mint one from your account session.\n`
        );
        return null;
    }
    // Mint a fresh deploy bearer via the control plane so the new box
    // can self-link. /api/v1/user/deploy/provision returns a 24h JWT
    // scoped to the same user as the session bearer.
    const url = config?.controlPlane?.url ?? "https://infernetprotocol.com";
    let mint;
    try {
        const res = await fetch(`${url}/api/v1/user/deploy/provision`, {
            method: "POST",
            headers: { "authorization": `Bearer ${sessionBearer}` }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        mint = await res.json();
    } catch (err) {
        process.stderr.write(`Failed to mint deploy bearer: ${err?.message ?? err}\n`);
        return null;
    }
    return buildOneliner(mint?.data?.token, args, url + (mint?.data?.cloud_init_url ?? "/api/deploy/cloud-init"));
}

function buildOneliner(bearer, args, fullUrl) {
    if (!bearer) return null;
    const url = fullUrl ?? `https://infernetprotocol.com/api/deploy/cloud-init?token=${encodeURIComponent(bearer)}`;
    return `curl -fsSL '${url}' | sh`;
}
