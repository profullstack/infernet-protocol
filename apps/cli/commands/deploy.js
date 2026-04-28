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

const PROVIDERS = Object.keys(adapters);

export const USAGE = `infernet deploy [up|auth] [flags]

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
`;

export default async function deploy(args) {
    const sub = args.positional?.[0] ?? "up";

    if (sub === "auth") return authSubcommand(args);
    if (sub === "up" || sub === undefined) return upSubcommand(args);
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
