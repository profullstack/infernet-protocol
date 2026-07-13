# Infernet Protocol Skill

Infernet Protocol is a peer-to-peer GPU compute marketplace for inference
and distributed training. Agents can run inference jobs, inspect live
network state, and read protocol documentation.

Base URL: https://infernetprotocol.com
Contact: hello@infernetprotocol.com
Docs: https://infernetprotocol.com/docs
Source: https://github.com/InfernetProtocol/infernet-protocol

## What you can do here

- Run a chat/inference job routed through real provider nodes (with a
  hosted fallback so the demo never breaks): `/chat`
- Read live network status — online nodes, queued jobs, providers: `/status`
- Learn how to run a node and earn crypto for GPUs you already have: `/getting-started`

## Public API endpoints

- `GET /api/health` — dependency-free liveness probe.
- `GET /api/overview` — network overview (nodes, jobs, providers).
- `GET /api/models` — models currently served on the network.
- `GET /api/nodes` — provider nodes.
- `GET /api/providers` — provider listings.
- `POST /api/chat` — submit a chat/inference job.
- `GET /api/chat/stream/{jobId}` — stream tokens back over SSE.
- `GET /.well-known/did.json` — DID document for verifiable identity.

## Notes

- Operators authenticate with a Nostr keypair, not a database credential.
- Open source (see GitHub). No native token; operators are paid in crypto
  for jobs they serve, clients pay per job in any supported coin.
