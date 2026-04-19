# @infernet/deploy-providers

Adapters for one-click deploying an Infernet provider node to cloud GPU services. Currently supports **RunPod**; more to come.

## Why

The canonical Infernet flow is "rent a GPU, install the CLI, start earning." The friction of SSH-ing into a rented box and running `pnpm install -g @infernet/cli` keeps that flow from ever being one click. This package wraps the cloud service APIs so the web dashboard can launch a pod running a pre-built Infernet provider image in a single POST.

## Design

Each adapter is **stateless**. It receives the user's cloud API key in-band with each call and never persists it — the Next.js route that fronts this package simply proxies the call and drops the key on response. Treat each adapter like a pure HTTP client.

## Adapters

- `@infernet/deploy-providers/runpod` — RunPod's GraphQL API. Deploys a pod running the `ghcr.io/profullstack/infernet-provider` image.

Every adapter exports:
- `listGpuTypes(apiKey)` → `Array<{ id, name, vramMb, pricePerHour, region? }>`
- `createDeployment({ apiKey, gpuTypeId, name, env, ... })` → `{ deploymentId, status, endpoint? }`
- `getDeployment({ apiKey, deploymentId })` → `{ status, endpoint? }`
- `destroyDeployment({ apiKey, deploymentId })` → `{ ok: true }`

## Required env on the deployed pod

The pod boots the infernet CLI; it needs at minimum:

- `SUPABASE_URL` — the control-plane Supabase URL
- `SUPABASE_SERVICE_ROLE_KEY` — service-role key for that project
- `INFERNET_NODE_ROLE` — `provider` (default) / `aggregator`
- `INFERNET_NODE_NAME` — human-readable name shown in the dashboard
- `INFERNET_P2P_PORT` — default `46337`

See [`tooling/docker/provider/`](../../tooling/docker/provider/) for the Dockerfile the adapter points at.
