# Infernet Protocol

A peer-to-peer protocol for distributed GPU inference. Earn crypto by sharing compute or access distributed AI inference on demand.

**Website:** [infernetprotocol.com](https://infernetprotocol.com)

## Architecture

Infernet is a fully decentralized protocol built on **libp2p** for cross-platform P2P networking (Node.js, browsers, mobile). Payments are handled by **CoinPay Portal** supporting BTC, ETH, SOL, POL, BCH, and USDC. A minimal **Supabase** layer provides bootstrap node discovery.

```
┌─────────────────────────────────────────────────────┐
│                   Infernet Network                   │
│                                                     │
│   ┌──────────┐   libp2p    ┌──────────┐            │
│   │ Provider │◄────────────►│  Client  │            │
│   │  Node    │  DHT/WebRTC │   Node   │            │
│   └────┬─────┘             └────┬─────┘            │
│        │                        │                   │
│        │   ┌────────────────┐   │                   │
│        └──►│  CoinPay       │◄──┘                   │
│            │  Escrow        │                       │
│            └────────────────┘                       │
└─────────────────────────────────────────────────────┘
```

## Stack

| Layer | Technology |
|-------|-----------|
| P2P Networking | libp2p (Kademlia DHT, WebRTC, WebSockets, WebTransport) |
| Web Dashboard | Next.js 15, React 19, Tailwind CSS |
| Desktop | Electron |
| Mobile | React Native + Expo |
| Payments | CoinPay Portal (BTC, ETH, SOL, POL, BCH, USDC) |
| Bootstrap | Supabase (minimal centralized peer registry) |
| Monorepo | Turborepo + pnpm workspaces |

## Repository Structure

```
infernet-protocol/
├── packages/
│   ├── core/          # P2P networking, execution, identity, payments
│   ├── shared/        # Types, constants, utilities
│   └── sdk/           # High-level SDK for building on Infernet
├── apps/
│   ├── web/           # Next.js dashboard + marketing site
│   ├── desktop/       # Electron desktop app
│   └── mobile/        # React Native + Expo mobile app
├── supabase/          # Migrations for bootstrap node registry
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [pnpm](https://pnpm.io/) v10+

### Install

```bash
git clone https://github.com/profullstack/infernet-protocol.git
cd infernet-protocol
pnpm install
```

### Configure

```bash
cp sample.env .env
# Edit .env with your Supabase and CoinPay credentials
```

### Development

```bash
# Run all apps in dev mode
pnpm dev

# Run just the web dashboard
pnpm --filter @infernet/web dev

# Build everything
pnpm build
```

### Desktop

```bash
# Start the web app first
pnpm --filter @infernet/web dev

# Then launch Electron
pnpm --filter @infernet/desktop dev
```

### Mobile

```bash
pnpm --filter @infernet/mobile dev
```

## Usage

### As a Client (consume compute)

```typescript
import { Infernet } from '@infernet/sdk';

const infernet = new Infernet({
  coinpayApiKey: process.env.COINPAY_API_KEY,
  coinpayApiUrl: 'https://coinpayportal.com',
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
});

await infernet.start();

const result = await infernet.infer('llama-3.1-70b', 'Explain quantum computing', {
  maxBudget: 0.01,
  currency: 'USDC_SOL',
});

console.log(result);
```

### As a Provider (share compute)

```typescript
import { InfernetNode } from '@infernet/core';

const node = new InfernetNode({
  coinpayApiKey: process.env.COINPAY_API_KEY,
  coinpayApiUrl: 'https://coinpayportal.com',
  walletAddresses: {
    SOL: 'your-solana-address',
    ETH: 'your-ethereum-address',
  },
});

// Register your execution backend
node.registerBackend(myLlamaBackend);

await node.start();

node.onJob(async (job) => {
  const output = await node.execution.execute(job);
  return output;
});
```

## Supported Payments

All payments are handled through [CoinPay Portal](https://coinpayportal.com), a non-custodial crypto payment gateway with built-in escrow.

| Currency | Chain |
|----------|-------|
| BTC | Bitcoin |
| ETH | Ethereum |
| SOL | Solana |
| POL | Polygon |
| BCH | Bitcoin Cash |
| USDC | Ethereum, Polygon, Solana |

## Roadmap

- [x] Protocol whitepaper
- [x] v2 architecture (libp2p + Next.js + CoinPay)
- [ ] Phase 1: MVP single-node inference
- [ ] Phase 2: Multi-node aggregation
- [ ] Phase 3: Reputation, verification, slashing
- [ ] Phase 4: Full CoinPay payment integration
- [ ] Phase 5: zkML proof research & implementation

## Contact

- Email: [protocol@infernet.tech](mailto:protocol@infernet.tech)
- Discord: [discord.gg/U7dEXfBA3s](https://discord.gg/U7dEXfBA3s)
- Reddit: [r/Infernet](https://www.reddit.com/r/Infernet/)

## License

ISC
