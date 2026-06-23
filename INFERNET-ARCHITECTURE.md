# Infernet Protocol - Architecture

## Overview

Infernet is a decentralized GPU inference marketplace. Its architecture is deliberately simple:

- One **central control plane** per operator — a Next.js 16 + React 19 dashboard backed by **Supabase** (Postgres + Auth + Realtime + Storage).
- Many **GPU nodes** — each server running the `infernet` CLI (or the Electron desktop app wrapping the same Next.js UI). Nodes register with the control plane, heartbeat, accept jobs, execute them in Docker, and report results / earnings.
- **Multi-coin payments** via a CoinPayPortal gateway, so consumers can pay (and providers can be paid out) in BTC, ETH, SOL, POL, BNB, XRP, ADA, DOGE, BCH, plus USDT / USDC on ETH / Polygon / Solana / Base.

Operators choose one of two deployment modes for the control plane:

1. **Self-hosted** — run Supabase yourself via the Supabase CLI (`supabase start`) for full privacy and control.
2. **Infernet cloud** — point the CLI at our hosted Supabase project at infernetprotocol.com. Canonical flow: rent a cloud GPU, `npm i -g infernet` or `pnpm dlx infernet init`, set the cloud URL, start earning crypto without standing up infrastructure.

The code path is identical in both modes; only the `SUPABASE_URL` and keys change.

---

## Topology

```
               ┌──────────────────────────────────────────┐
               │     Central control plane (Next.js)      │
               │                                          │
               │   - /api/overview, /api/nodes, /api/jobs │
               │   - /api/payments/invoice  (CoinPayPortal)│
               │   - /api/payments/webhook  (CoinPayPortal)│
               │   - React dashboard for operators        │
               └─────────────────┬────────────────────────┘
                                 │
                     Supabase client (service role, server-only)
                                 │
               ┌─────────────────▼────────────────────────┐
               │    Supabase (self-hosted OR cloud)       │
               │                                          │
               │  providers | clients | aggregators | jobs│
               │  models | users | settings | node_roles  │
               │  distributed_jobs | platform_wallets     │
               │  provider_payouts | payment_transactions │
               └─────┬─────────────────┬─────────────┬────┘
                     │  Realtime /     │ anon key    │ service-role
                     │  REST           │ (mobile)    │ (CLI)
          ┌──────────▼──┐    ┌─────────▼──┐   ┌──────▼────────────┐
          │  GPU Node 1 │    │  GPU Node N│   │  Mobile (Expo)    │
          │  infernet   │    │  infernet  │   │  React Native     │
          │  CLI + TUI  │    │  CLI + TUI │   │  (read-only dash) │
          └─────────────┘    └────────────┘   └───────────────────┘
```

Every node — whether it's a rented H100 box or a home workstation — runs the same `infernet` daemon, writes its state to the same Supabase project, and shows up in the same dashboard. Management for a fleet of many nodes happens in one place.

---

## Supported platforms

- **CLI / Daemon**: Node.js 18+, ESM, single-binary `infernet` executable. Ships as `./cli/index.js` exposed via the `bin` field in the root `package.json`.
- **Web (PWA) + Desktop**: Next.js 16 App Router with React 19 and Tailwind CSS. Desktop is the same Next.js app wrapped by Electron (`desktop/`).
- **Mobile**: React Native + Expo (`mobile/`). Uses the Supabase anon key (never the service role); RLS policies enforce access.

---

## Core technologies

- **Backend**: Supabase (Postgres + Auth + Storage + Realtime). Accessed only from server-side Next.js modules, the CLI daemon, and the mobile anon client. Never from browser bundles of the web app.
- **Auth**: Nostr keypair identity. Every node has a Nostr pubkey stored in `providers.public_key` / `clients.public_key` / `aggregators.public_key`; Supabase RLS can be layered on top.
- **Communication**: WebSockets for real-time coordinator ↔ worker traffic in distributed inference; Supabase Realtime channels for dashboard updates; REST for everything else.
- **Networking**: Peer discovery + workload auctions live in [c0mpute](https://c0mpute.com) — libp2p Kad-DHT + gossipsub. Infernet runs as a c0mpute workload plugin and reads the capability registry instead of running its own DHT.
- **Containerization**: Docker for job execution sandboxing.
- **Payments**: CoinPayPortal gateway. Inbound payments land at one of the platform deposit addresses in `config/deposit-addresses.js` (mirrored into `platform_wallets`). Outbound payouts settle to the provider's preferred address in `provider_payouts`. Full audit trail in `payment_transactions`.

---

## CLI (GPU-node daemon)

Installed with `pnpm add -g` (or `npm i -g`). Commands:

- `infernet init` — interactive setup. Prompts for Supabase URL + service-role key, node role (`provider` / `aggregator` / `client`), display name, and Nostr identity. Writes `~/.config/infernet/config.json` at mode 0600.
- `infernet login` — rotate Supabase credentials.
- `infernet register` — inserts or updates this node's row in Supabase (`providers` / `aggregators` / `clients`) keyed on `node_id`. Captures local specs (CPU count, RAM, hostname, platform) into the `specs` jsonb column.
- `infernet start` — the daemon:
  - Writes a PID file at `~/.config/infernet/daemon.pid`.
  - Heartbeats every 30s (sets `last_seen` and `status='available'`).
  - Polls `jobs` every 15s for rows assigned to this node (`provider_id = self`), marks them `running`, executes them, writes `result` / `error`, flips to `completed` / `failed`.
  - Records each settled job as an outbound row in `payment_transactions`.
  - On SIGINT/SIGTERM: flips status to `offline`, closes Supabase, exits 0.
- `infernet status` — prints this node's current row plus USD earnings summary (sum of confirmed outbound `payment_transactions`).
- `infernet stop` — reads the PID file, sends SIGTERM.
- `infernet payout set <coin> <address>` — configures payout wallet. `infernet payout list` shows all configured payout addresses (one marked `*` default).
- `infernet payments list [--limit N]` — tabulated recent transactions for this node.

The CLI uses `@supabase/supabase-js` directly with the service-role key. It does **not** import the Next.js-only `lib/supabase/server.js` (which is marked `server-only`).

---

## Web / Desktop (Next.js 16 + React + Electron)

Shared app under `app/`:

- Server components in `app/page.js`, `app/nodes/page.js`, etc., read from Supabase through `lib/data/infernet.js` (server-only).
- API route handlers under `app/api/`:
  - `GET /api/overview`, `/api/nodes`, `/api/jobs`, `/api/providers`, `/api/aggregators`, `/api/clients`, `/api/models` — read-only dashboards feed.
  - `POST /api/payments/invoice` — mints a CoinPayPortal invoice for a given `jobId` + `coin`.
  - `POST /api/payments/webhook` — receives CoinPayPortal confirmations, updates `payment_transactions.status` and mirrors onto `jobs.payment_status`.
- Client components never import `@supabase/supabase-js`. They fetch from the API routes.

Desktop (`desktop/`) is an Electron shell that loads the Next.js app as its renderer — no duplicate UI code.

---

## Mobile (React Native + Expo)

`mobile/` uses the Supabase anon key exclusively (configured through `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`). Supabase RLS policies gate what the anon key can see. The mobile app shows node / job / earnings dashboards and is primarily a read-only window into the operator's fleet, plus a job submission form for consumers.

---

## Peer discovery (provided by c0mpute)

Cross-operator node discovery runs through [c0mpute](https://c0mpute.com), the p2p substrate infernet is built on. c0mpute exposes a libp2p Kad-DHT for peer discovery and a gossipsub auction layer (`c0mpute/jobs/infernet.inference` topic) for workload offers — see the [c0mpute DIPs](https://github.com/profullstack/c0mpute/tree/master/dips), particularly DIP-0010 (bootstrap), DIP-0011 (no-central-backend), and DIP-0014 (status aggregator).

In the default single-operator deployment, discovery is still unnecessary — the Supabase project is the rendezvous point. Cross-operator deployments inherit c0mpute's DHT for free, no infernet-side wiring required.

Infernet historically maintained its own Hyperswarm DHT (IPIP-0032). That layer was retired when c0mpute became the substrate; the IPIP is preserved as a `Superseded` historical record.

---

## Payments

### Inbound (consumer → platform)

1. Consumer submits a job via the web app or API. `jobs.payment_offer` is set to the quoted price (USD).
2. Consumer POSTs to `/api/payments/invoice` with `{ jobId, coin }`. Supported coins are enforced against `config/payment-coins.js`.
3. The route creates a CoinPayPortal invoice via `src/payments/coinpayportal.js`, updates `jobs.payment_invoice` + `payment_status='invoiced'`, and inserts a pending inbound row into `payment_transactions`.
4. The consumer pays the invoice in their wallet of choice.
5. CoinPayPortal fires a signed webhook to `/api/payments/webhook`. We verify the HMAC, update `payment_transactions.status='confirmed'`, and mirror `jobs.payment_status='paid'` + `payment_tx_hash`.
6. The central dashboard sees the payment confirmation via Supabase Realtime; the job is now eligible for dispatch.

### Outbound (platform → provider)

1. Provider configures a preferred payout wallet with `infernet payout set <coin> <address>` — stored in `provider_payouts` (with a default-flag lifecycle).
2. When a job completes successfully, the CLI writes an outbound row to `payment_transactions` (direction `outbound`, provider_id, amount) as an accounting marker.
3. Settlement against CoinPayPortal is a scheduled batch job (future).

### Supported coins

Canonical list in `config/payment-coins.js`:

- BTC, BCH, ETH, SOL, POL, BNB, XRP, ADA, DOGE
- Stablecoins: USDT on ETH/Polygon/Solana, USDC on ETH/Polygon/Solana/Base

Canonical platform deposit addresses in `config/deposit-addresses.js` and seeded into `platform_wallets`.

---

## Security

- Supabase service-role key NEVER leaves the server. CLI stores it in a mode-0600 file under `~/.config/infernet/`. Web app uses it only in server components / route handlers.
- Mobile uses the anon key plus RLS.
- Nostr pubkey on every node row enables signed challenge-response when RLS / signature verification is enabled.
- Container isolation (Docker) for job execution.
- CoinPayPortal webhooks verified via HMAC-SHA256 before any DB write.
- Future: secure enclaves (SGX / SEV) for sensitive inference jobs.

---

## Logging & monitoring

- CLI: structured logs via `src/utils/logger.js`.
- Web: console + server-side logs.
- Dashboard: `last_seen` per row surfaces stale nodes; `payment_transactions` gives a single audit view across all coins.

---

## Distributed inference

Multi-node inference is coordinated via the `node_roles` and `distributed_jobs` tables plus WebSocket traffic. Coordinator and worker classes live in `src/inference/distributed/`. This is a code path the CLI exposes but is not required for single-node inference jobs.

Parallelism strategies: tensor parallel, pipeline parallel, and hybrid. See `src/inference/distributed/protocol.js`.

---

## Repo layout

```
app/                     Next.js pages and route handlers
components/              React UI building blocks
lib/                     Next.js server-only env, Supabase client, data helpers
cli/                     The `infernet` CLI binary
config/                  Payment-coin list + deposit addresses (shared)
desktop/                 Electron shell wrapping the Next.js app
mobile/                  React Native + Expo app
src/                     CLI / protocol runtime
  ├ db/                  Supabase-backed model layer for the CLI
  ├ payments/            CoinPayPortal integration
  ├ inference/           Distributed inference coordinator / worker
  ├ auth/                Nostr auth helpers
  └ …
supabase/migrations/     SQL schema (self-hosted AND cloud)
tests/                   Vitest suite
```

---

## Contact

For technical contributions: protocol@infernetprotocol.com
