<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/logo.infernet.white.svg">
    <source media="(prefers-color-scheme: light)" srcset="./assets/logo.infernet.black.svg">
    <img alt="Infernet Protocol" src="./assets/logo.infernet.black.svg" width="520">
  </picture>
</p>

# Infernet Protocol

A decentralized GPU inference marketplace. Rent a GPU anywhere, run one `docker` command, start earning crypto. The control plane is a Next.js dashboard; GPU nodes authenticate with **Nostr-signed HTTP requests** — they never hold a database credential, run as an unprivileged user, and can operate outbound-only. Scales horizontally — every new provider on the network is real, additional capacity.

[![Docker image](https://img.shields.io/badge/ghcr.io-infernet--provider-blue?logo=docker)](https://github.com/profullstack/infernet-protocol/pkgs/container/infernet-provider)
[![Release](https://img.shields.io/github/v/release/profullstack/infernet-protocol)](https://github.com/profullstack/infernet-protocol/releases)

---

## What you get

- **Next.js 16 + React 19** web dashboard. Also ships as the Electron desktop app (same app, Electron wrapper).
- **Public chat playground** at `/chat` — streams tokens via Server-Sent Events. Uses live P2P providers if any are online; otherwise falls back to **NVIDIA NIM** ([build.nvidia.com](https://build.nvidia.com/)) so the demo never breaks.
- **One-click GPU deploy** at `/deploy` — paste a RunPod API key, pick a GPU, the image boots and registers with your control plane automatically.
- **`infernet` CLI** — one binary per GPU server. 14 subcommands: `init`, `login`, `register`, `update`, `remove`, `start`, `stop`, `status`, `stats`, `logs`, `payout`, `payments`, `gpu`, `firewall`. Daemon has a local IPC socket for live queries + a **public P2P TCP port 46337** (dual-stack IPv4/IPv6) for direct peer communication.
- **Supabase** backend on the server — Postgres + Auth + Realtime. Self-hosted or cloud.
- **Nostr-signed node API** at `/api/v1/node/*` — GPU nodes sign every request with their secp256k1 / BIP-340 keypair; the control plane verifies the signature before touching the DB. No service-role keys ever leave the server.
- **Privacy-preserving telemetry** — heartbeats carry only coarse GPU capability (vendor + VRAM tier). No hostname, platform, CPU model, or RAM total is stored.
- **Multi-coin payments** via CoinPayPortal — BTC, BCH, ETH, SOL, POL, BNB, XRP, ADA, DOGE, plus USDT/USDC on ETH/Polygon/Solana/Base.
- **GPU auto-detect** — nvidia-smi, rocm-smi, Apple Silicon; stashed in `providers.specs.gpus` for control-plane job matching.

## Deployment modes

The control plane runs one of two ways:

1. **Self-hosted** — run Supabase yourself via the Supabase CLI (`supabase start`). Best for privacy and offline development.
2. **Infernet cloud** — point the CLI at our hosted Supabase project. Rent a GPU anywhere, `infernet init`, start earning.

Operators can run **many GPU nodes against the same Supabase project** — they all show up in the same dashboard.

---

## Architecture (one page)

```
       ┌────────────────────────────────────────────────┐
       │   Next.js dashboard (self-hosted OR cloud)     │
       │   /chat · /deploy · /api/* · SSE streaming     │
       │   /api/v1/node/* — signature-verified endpoints│
       └───────────────────────┬────────────────────────┘
                               │  (server-side only)
                               ▼
       ┌────────────────────────────────────────────────┐
       │                  Supabase                      │
       │  providers · clients · aggregators · jobs      │
       │  users · job_events · platform_wallets         │
       │  provider_payouts · payment_transactions       │
       └────────────────────────────────────────────────┘
                               ▲
        Nostr-signed HTTP      │        anon / SSE
        (BIP-340 Schnorr)      │
   ┌────────────┐   ┌──────────┐   ┌─────────────────┐
   │ infernet   │…  │ Expo app │   │ NVIDIA NIM      │
   │ CLI daemon │   │          │   │ (fallback only) │
   │ P2P:46337  │   └──────────┘   └─────────────────┘
   │ IPC sock   │
   └────────────┘
```

The GPU node holds a Nostr keypair (generated on `infernet init`); every
call to the control plane carries an `X-Infernet-Auth` envelope with a
Schnorr signature over method + path + timestamp + nonce + sha256(body).
The server enforces that the signing pubkey owns the target row. No DB
credential ever lives on the node.

Full detail: [INFERNET-ARCHITECTURE.md](./INFERNET-ARCHITECTURE.md).

---

## Stack

- Node.js 18+, ESM only, **pnpm workspaces** monorepo (5 apps, 11 shared packages)
- Next.js 16.x (App Router), React 19, Tailwind CSS
- Supabase (`@supabase/supabase-js`)
- Vitest for tests
- Electron for the desktop shell
- React Native + Expo for mobile
- Docker + GitHub Actions CI/CD (multi-arch images: `linux/amd64` + `linux/arm64`)

---

## Quick start

### 1. Control plane (one-time)

Self-hosted:

```bash
pnpm install
pnpm supabase:start
pnpm supabase:db:reset   # applies all migrations in supabase/migrations/
pnpm dev                 # dashboard at http://localhost:3000
```

Or point at Supabase cloud:

```bash
pnpm install
pnpm supabase:login
pnpm supabase:link
pnpm supabase:db:push    # pushes migrations to the cloud project
pnpm dev
```

Copy `sample.env` → `.env.local` and fill in `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and the CoinPayPortal keys.

### 2. Each GPU server (Docker — the supported install path today)

```bash
docker run --rm -it \
  --gpus all \
  -p 46337:46337 \
  -e INFERNET_CONTROL_PLANE_URL=https://infernet.tech \
  -e INFERNET_NODE_NAME=edge-01 \
  ghcr.io/profullstack/infernet-provider:latest
```

Multi-arch (`linux/amd64` + `linux/arm64`). The image calls `infernet init` → `infernet register` → `infernet start --foreground` internally, so one command boots a provider and starts accepting jobs. No database credentials are passed in — the container generates its own Nostr keypair on first run and uses it to sign every request.

#### Running the CLI directly

If you cloned the repo:

```bash
pnpm install
pnpm --filter @infernetprotocol/cli start -- help     # any subcommand
```

Full CLI surface: `init`, `login`, `register`, `update`, `remove`, `start`, `stop`, `status`, `stats`, `logs`, `payout`, `payments`, `gpu`, `firewall`. Config lives at `~/.config/infernet/config.json`.

npm install (`npm i -g @infernetprotocol/cli`) and Homebrew (`brew install infernet`) are on the roadmap.

`infernet init` walks through:

- Control-plane URL (default `https://infernet.tech`, or your self-hosted instance)
- Node role (`provider` / `aggregator` / `client`)
- Human-readable name
- Nostr keypair — real secp256k1 / BIP-340 (auto-generated; bring your own with `--nostr-privkey`)
- P2P port (default **46337**, TCP, dual-stack IPv6/IPv4) — pass `--no-advertise` to stay outbound-only
- Auto-detected local address (override with `--address`)
- GPU detection via `nvidia-smi` / `rocm-smi` / `system_profiler`
- Firewall hint per your distro

Config lives at `~/.config/infernet/config.json` (mode 0600). It contains the node's Nostr keypair and the control-plane URL — no database credentials, no service-role keys.

---

## CLI surface

```
Node lifecycle:
  init          First-time setup (generates Nostr keypair)
  login         Re-point at a different control plane
  register      Announce this node (signed POST /api/v1/node/register)
  update        Re-push current state (signed; upsert)
  remove        Deregister and wipe local config (signed)

Daemon:
  start         Start daemon (detached; --foreground for supervisors)
  stop          Stop daemon (graceful via IPC, signal fallback)
  status        Supabase row + live daemon snapshot
  stats         Live in-memory daemon stats via IPC
  logs          Show / tail the daemon log (-f for follow)

Diagnostics:
  gpu           Inspect local GPUs (list | json)
  firewall      Print firewall commands for the P2P port

Payments:
  payout        Manage payout coin/address (set, list)
  payments      Show recent payment transactions
```

### Daemon ↔ CLI

`infernet start` detaches into the background (logs at `~/.config/infernet/daemon.log`) and exposes a **Unix-domain IPC socket** at `~/.config/infernet/daemon.sock`. The other CLI commands use that socket for live queries:

- `infernet status` merges Supabase state with the daemon's in-memory snapshot.
- `infernet stats` shows heartbeat counts, poll counts, active jobs, uptime, P2P connections.
- `infernet stop` sends a graceful shutdown command; falls back to SIGTERM via the PID file.
- `infernet logs -f` tails the log file.

Use `infernet start --foreground` under systemd / Docker / Kubernetes when a supervisor wants the process in the foreground.

### P2P port

Each provider/aggregator node binds TCP **46337** (dual-stack) for peer communication. Change with `--p2p-port`, or disable with `--no-p2p`. The node advertises its `address:port` to Supabase on every heartbeat so other nodes (and the dashboard) can discover it.

Need to open the port on your firewall? `infernet firewall` prints the exact commands for ufw / firewalld / nftables / iptables (Linux), pf (macOS), or netsh (Windows). We never touch firewall state automatically.

### GPU support

The CLI auto-detects GPUs on `init`, `register`, `update`, and daemon heartbeat:

- **NVIDIA** (CUDA) via `nvidia-smi` — model, VRAM, driver, CUDA version, utilization, temperature, power.
- **AMD** (ROCm) via `rocm-smi` — same fields where available.
- **Apple Silicon** via `system_profiler` — model, unified memory.
- Falls back to CPU-only if no GPU tooling is installed.

Detected GPUs land in `providers.specs.gpus` (jsonb), which powers job matching on the control plane (e.g. "find me a provider with ≥80GB VRAM and CUDA 12.4").

---

## NVIDIA NIM fallback

When the P2P network has no live providers, the chat playground transparently falls back to [build.nvidia.com](https://build.nvidia.com/)'s OpenAI-compatible endpoint so the UX never breaks while the network is bootstrapping. Controlled by three env vars (all optional; leave blank to disable):

```bash
NVIDIA_NIM_API_KEY=             # from https://build.nvidia.com/
NVIDIA_NIM_API_URL=https://integrate.api.nvidia.com/v1
NVIDIA_NIM_DEFAULT_MODEL=meta/llama-3.3-70b-instruct
```

Same SSE contract as the P2P path — tokens are mirrored into `job_events` so the audit trail is identical. The chat UI badges fallback responses "NVIDIA NIM (fallback)" for transparency. Adapter: [`packages/nim-adapter`](./packages/nim-adapter).

## Payments

Consumers can pay for jobs and providers can be paid out in any of these coin/network combinations:

BTC, BCH, ETH, SOL, POL, BNB, XRP, ADA, DOGE; plus USDT on ETH/Polygon/Solana; plus USDC on ETH/Polygon/Solana/Base.

- Canonical list: [`packages/config/payment-coins.js`](./packages/config/payment-coins.js)
- Platform deposit addresses: [`packages/config/deposit-addresses.js`](./packages/config/deposit-addresses.js) — also seeded into the `platform_wallets` table.
- Gateway: CoinPayPortal ([`src/payments/coinpayportal.js`](./src/payments/coinpayportal.js)). Set `COINPAYPORTAL_API_KEY`, `COINPAYPORTAL_WEBHOOK_SECRET` in `.env.local`.
- Invoice: `POST /api/payments/invoice` with `{ jobId, coin }`.
- Webhook: `POST /api/payments/webhook` — HMAC-verified, updates `payment_transactions` + `jobs.payment_status`.

Provider earnings flow into the outbound direction of `payment_transactions`. Configure a payout wallet with `infernet payout set <COIN> <ADDRESS>`.

---

## Project layout (monorepo)

```
apps/
  web/                   Next.js dashboard + /chat + /deploy + REST/SSE API
  cli/                   The `infernet` binary (commands + daemon + IPC)
  desktop/               Electron shell wrapping the Next.js app
  mobile/                React Native + Expo app
  daemon/                Placeholder for future standalone service daemons

packages/
  config/                Payment-coin list + canonical deposit addresses
  auth/                  Nostr auth helpers
  db/                    Supabase-backed model layer
  gpu/                   GPU detection (NVIDIA / AMD / Apple Silicon)
  inference/             Distributed inference coordinator / worker
  payments/              CoinPayPortal gateway
  logger/                Structured logger
  sdk-js/                @infernetprotocol/sdk — REST + SSE client
  api-schema/            OpenAPI 3.1 spec for the control-plane API
  deploy-providers/      Cloud-GPU deploy adapters (RunPod today)
  nim-adapter/           NVIDIA NIM fallback inference adapter

tooling/
  docker/provider/       Dockerfile + entrypoint for ghcr.io/.../infernet-provider
  dist/homebrew/         Homebrew formula + release-time updater

supabase/migrations/     SQL schema (applied via supabase CLI)
tests/                   Vitest suite
```

---

## API routes

```
GET   /api/overview
GET   /api/nodes
GET   /api/jobs
GET   /api/providers
GET   /api/aggregators
GET   /api/clients
GET   /api/models
POST  /api/chat                            Chat playground — picks P2P provider OR NIM fallback, returns streamUrl
GET   /api/chat/stream/[jobId]             SSE: tokens streamed live (job|meta|token|done|error)
POST  /api/payments/invoice                CoinPayPortal invoice mint
POST  /api/payments/webhook                CoinPayPortal webhook sink (HMAC-verified)
GET   /api/deploy/runpod/gpu-types         RunPod GPU catalog (proxied via user API key; not stored)
POST  /api/deploy/runpod                   One-click launch an Infernet provider pod

Signature-verified node API (Nostr / BIP-340 Schnorr):
POST  /api/v1/node/register                Upsert a provider/aggregator/client row
POST  /api/v1/node/heartbeat               Refresh last_seen / status / address / port
POST  /api/v1/node/jobs/poll               Pull assigned jobs for this provider
POST  /api/v1/node/jobs/[id]/complete      Mark a job completed / failed + record payout row
POST  /api/v1/node/jobs/[id]/events        Batch-emit streaming tokens into job_events
POST  /api/v1/node/remove                  Deregister this node
POST  /api/v1/node/me                      Fetch this node's own row
POST  /api/v1/node/payments/list           List payment_transactions for this node
POST  /api/v1/node/payouts/{list,set}      Manage provider_payouts rows
```

All server-only. The Supabase service-role client is never imported into browser bundles. OpenAPI 3.1 spec ships as [`@infernetprotocol/api-schema`](./packages/api-schema) (raw YAML at `packages/api-schema/openapi.yaml`).

## Developer surfaces

- **`@infernetprotocol/sdk`** ([packages/sdk-js](./packages/sdk-js)) — JS/TS SDK with an `InfernetClient` and an async-iterator `chat()` helper for the SSE stream.
- **`@infernetprotocol/api-schema`** ([packages/api-schema](./packages/api-schema)) — OpenAPI 3.1 spec; feed to any generator for Python/Go/Rust clients.
- **`@infernetprotocol/deploy-providers`** ([packages/deploy-providers](./packages/deploy-providers)) — cloud-GPU adapters (RunPod today) powering the one-click `/deploy` page.

## Distribution

- **Docker** (LIVE) — `ghcr.io/profullstack/infernet-provider:0.1.0` and `:latest`, multi-arch `linux/amd64` + `linux/arm64`. One command boots a provider; see the Quick start above.
- **npm** (scaffolded, unblock pending) — 11 publishable `@infernetprotocol/*` packages (`cli`, `sdk`, `api-schema`, `deploy-providers`, `nim-adapter`, `auth`, `config`, `db`, `gpu`, `inference`, `logger`, `payments`). Release workflow + dry-run publish are ready; waiting on an npm Automation token.
- **Homebrew** (scaffolded) — formula + updater script at [`tooling/dist/homebrew`](./tooling/dist/homebrew). Tap repo at [`profullstack/homebrew-infernet`](https://github.com/profullstack/homebrew-infernet). Activates as soon as npm ships.

Tag a `v*.*.*` and [`.github/workflows/release.yml`](./.github/workflows/release.yml) builds the Docker image and creates a GitHub Release. See [`docs/RELEASING.md`](./docs/RELEASING.md) for the full flow.

## One-click GPU deploy

The `/deploy` page (backed by `POST /api/deploy/runpod`) spins up an Infernet provider node on RunPod using a user-supplied API key. The server proxies the RunPod API call and immediately drops the key — nothing is persisted. The pod boots the `infernet-provider` image, registers with the supplied Supabase control plane, and starts heartbeating.

---

## Contributing

See [docs/CONTRIBUTING.md](./docs/CONTRIBUTING.md).

## License

MIT. See [LICENSE](./LICENSE).
