<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/logo.infernet.white.svg">
    <source media="(prefers-color-scheme: light)" srcset="./assets/logo.infernet.black.svg">
    <img alt="Infernet Protocol" src="./assets/logo.infernet.black.svg" width="520">
  </picture>
</p>

# Infernet Protocol

A decentralized GPU inference marketplace. Install the `infernet` CLI on any GPU server, point it at a Supabase control plane, and start earning crypto for inference jobs.

---

## What you get

- **Next.js 16 + React 19** web dashboard (works as a PWA, and is also the Electron desktop app).
- **Supabase** backend — self-hosted or cloud; the code is identical either way.
- **`infernet` CLI** — one binary per GPU server. Registers the node, heartbeats, accepts jobs, reports earnings.
- **Multi-coin payments** via CoinPayPortal — BTC, BCH, ETH, SOL, POL, BNB, XRP, ADA, DOGE, plus USDT/USDC on ETH/Polygon/Solana/Base.
- **Nostr-based identity** for node authentication.
- **P2P port** (default 46337) so nodes can reach each other directly, not just via Supabase.

## Deployment modes

The control plane runs one of two ways:

1. **Self-hosted** — run Supabase yourself via the Supabase CLI (`supabase start`). Best for privacy and offline development.
2. **Infernet cloud** — point the CLI at our hosted Supabase project. Rent a GPU anywhere, `infernet init`, start earning.

Operators can run **many GPU nodes against the same Supabase project** — they all show up in the same dashboard.

---

## Architecture (one page)

```
            ┌───────────────────────────────────────┐
            │   Next.js dashboard (self-hosted or   │
            │   cloud) — reads/writes Supabase      │
            └───────────────────┬───────────────────┘
                                │  REST + Realtime
                                ▼
            ┌───────────────────────────────────────┐
            │              Supabase                 │
            │  providers/clients/aggregators/jobs   │
            │  users/settings/node_roles            │
            │  platform_wallets/provider_payouts    │
            │  payment_transactions                 │
            └──────┬─────────────────────┬──────────┘
                   │ service role        │ anon
                   │ (CLI daemon)        │ (mobile)
          ┌────────▼──────┐     ┌────────▼───────┐
          │ infernet CLI  │ ... │ React Native   │
          │  heartbeat    │     │ (Expo)         │
          │  P2P:46337    │     │                │
          │  IPC socket   │     └────────────────┘
          └───────────────┘
```

Full detail: [INFERNET-ARCHITECTURE.md](./INFERNET-ARCHITECTURE.md).

---

## Stack

- Node.js 18+, ESM only
- Next.js 16.x (App Router), React 19, Tailwind CSS
- Supabase (`@supabase/supabase-js`)
- Vitest for tests
- Electron for the desktop shell
- React Native + Expo for mobile

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

### 2. Each GPU server

```bash
pnpm install -g .        # or: pnpm link --global from the repo
infernet init            # prompts for Supabase URL/key, role, P2P port, identity
infernet gpu list        # confirm your GPUs were detected
infernet register        # announce this node to the control plane
infernet start           # daemon: heartbeat + job poll + P2P listener (detaches by default)
infernet status          # combined Supabase row + live daemon snapshot
infernet stats           # live in-memory counters via IPC
infernet logs -f         # tail ~/.config/infernet/daemon.log
infernet firewall        # prints ufw/firewalld/iptables commands for the P2P port
```

`infernet init` walks through:

- Supabase URL + service-role key
- Node role (`provider` / `aggregator` / `client`)
- Human-readable name
- Nostr keypair (auto-generated if you don't have one)
- P2P port (default **46337**, TCP, dual-stack IPv6/IPv4)
- Auto-detected public local address (override with `--address`)
- GPU detection via `nvidia-smi` / `rocm-smi` / `system_profiler`
- Firewall hint per your distro

Config lives at `~/.config/infernet/config.json` (mode 0600).

---

## CLI surface

```
Node lifecycle:
  init          First-time setup
  login         Rotate Supabase credentials
  register      Announce this node to the control plane
  update        Re-push current state (refresh specs/port/status)
  remove        Deregister and wipe local config

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

## Payments

Consumers can pay for jobs and providers can be paid out in any of these coin/network combinations:

BTC, BCH, ETH, SOL, POL, BNB, XRP, ADA, DOGE; plus USDT on ETH/Polygon/Solana; plus USDC on ETH/Polygon/Solana/Base.

- Canonical list: [`config/payment-coins.js`](./config/payment-coins.js)
- Platform deposit addresses: [`config/deposit-addresses.js`](./config/deposit-addresses.js) — also seeded into the `platform_wallets` table.
- Gateway: CoinPayPortal ([`src/payments/coinpayportal.js`](./src/payments/coinpayportal.js)). Set `COINPAYPORTAL_API_KEY`, `COINPAYPORTAL_WEBHOOK_SECRET` in `.env.local`.
- Invoice: `POST /api/payments/invoice` with `{ jobId, coin }`.
- Webhook: `POST /api/payments/webhook` — HMAC-verified, updates `payment_transactions` + `jobs.payment_status`.

Provider earnings flow into the outbound direction of `payment_transactions`. Configure a payout wallet with `infernet payout set <COIN> <ADDRESS>`.

---

## Project layout

```
app/                     Next.js pages and route handlers
components/              React UI building blocks
lib/                     Next.js server-only env, Supabase client, data helpers
cli/                     The `infernet` binary (commands + lib)
config/                  Payment-coin list + canonical deposit addresses
desktop/                 Electron shell wrapping the Next.js app
mobile/                  React Native + Expo app
src/
  ├ db/                  Supabase-backed model layer for the CLI
  ├ payments/            CoinPayPortal integration
  ├ gpu/                 GPU detection (NVIDIA/AMD/Apple)
  ├ inference/           Distributed inference coordinator / worker
  ├ auth/                Nostr auth helpers
  └ ...
supabase/migrations/     SQL schema
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
POST  /api/chat                            Chat playground — creates a job, returns streamUrl
GET   /api/chat/stream/[jobId]             SSE: tokens from the assigned provider
POST  /api/payments/invoice                CoinPayPortal invoice mint
POST  /api/payments/webhook                CoinPayPortal webhook sink (HMAC)
GET   /api/deploy/runpod/gpu-types         RunPod GPU catalog (proxied via user API key)
POST  /api/deploy/runpod                   One-click launch an Infernet provider pod
```

All server-only. The Supabase service-role client is never imported into browser bundles. OpenAPI 3.1 spec lives at [`packages/api-schema/openapi.yaml`](./packages/api-schema/openapi.yaml).

## Developer surfaces

- **`@infernet/sdk`** ([packages/sdk-js](./packages/sdk-js)) — JS/TS SDK with an `InfernetClient` and an async-iterator `chat()` helper for the SSE stream.
- **`@infernet/api-schema`** ([packages/api-schema](./packages/api-schema)) — OpenAPI 3.1 spec; feed to any generator for Python/Go/Rust clients.
- **`@infernet/deploy-providers`** ([packages/deploy-providers](./packages/deploy-providers)) — cloud-GPU adapters (RunPod today) powering the one-click `/deploy` page.

## Distribution

- **npm** — every public `@infernet/*` workspace package (CLI, SDK, deploy-providers, api-schema, payments, config, db, gpu, auth, logger, inference) is published on tag push.
- **Docker** ([tooling/docker/provider](./tooling/docker/provider)) — `ghcr.io/profullstack/infernet-provider:<version>` / `:latest` / `:edge` images. Basis for the one-click deploy flow.
- **Homebrew** ([tooling/dist/homebrew](./tooling/dist/homebrew)) — formula + updater script. On release, the generated `infernet.rb` is attached to the GitHub Release; sync into the `profullstack/homebrew-infernet` tap.

The full release pipeline lives at [`.github/workflows/release.yml`](./.github/workflows/release.yml) — tag a `v*.*.*` and it publishes npm, builds + pushes the Docker image, and generates the Homebrew formula. See [docs/RELEASING.md](./docs/RELEASING.md) for secrets setup + rollback notes.

## One-click GPU deploy

The `/deploy` page (backed by `POST /api/deploy/runpod`) spins up an Infernet provider node on RunPod using a user-supplied API key. The server proxies the RunPod API call and immediately drops the key — nothing is persisted. The pod boots the `infernet-provider` image, registers with the supplied Supabase control plane, and starts heartbeating.

---

## Contributing

See [docs/CONTRIBUTING.md](./docs/CONTRIBUTING.md).

## License

MIT. See [LICENSE](./LICENSE).
