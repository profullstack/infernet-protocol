# Architecture

Infernet Protocol has four major components: the control plane, node daemons, inference backends, and the on-chain payment layer. Here's how they connect.

## Component Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        CONTROL PLANE                            │
│                   (Next.js + Supabase)                          │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  Node        │  │  Job         │  │  Payment             │  │
│  │  Registry    │  │  Router      │  │  Accounting          │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │  HTTPS / SSE
         ┌───────────────────┼───────────────────┐
         │                   │                   │
         ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│   NODE DAEMON   │ │   NODE DAEMON   │ │   NODE DAEMON   │
│  (infernet      │ │  (infernet      │ │  (infernet      │
│   start)        │ │   start)        │ │   start)        │
│                 │ │                 │ │                 │
│ ┌─────────────┐ │ │ ┌─────────────┐ │ │ ┌─────────────┐ │
│ │   Ollama    │ │ │ │    vLLM     │ │ │ │   SGLang    │ │
│ │  (default)  │ │ │ │             │ │ │ │             │ │
│ └─────────────┘ │ │ └─────────────┘ │ │ └─────────────┘ │
└────────┬────────┘ └─────────────────┘ └─────────────────┘
         │
         ▼ on-chain
┌─────────────────────────────┐
│   PAYMENT LAYER             │
│   (EVM / Solana / etc.)     │
│   Compute Payment Receipts  │
└─────────────────────────────┘
```

## Control Plane

The control plane is a Next.js application backed by Supabase. It serves two audiences:

**The dashboard** — a web UI for operators to see their nodes' status, earnings, model inventory, and recent jobs. Clients can also use the dashboard to browse available models and manage API access.

**The API** — the REST endpoints that clients call to submit jobs and that node daemons call to register, heartbeat, and poll for commands. The primary job submission endpoint is `POST /api/v1/jobs`.

Supabase handles persistence: node registrations, job records, payment accounting, and the command queue (model installs/removes). Supabase Realtime is used for live dashboard updates.

The control plane is open source. You can self-host it — see [Chapter 6: Self-Hosting](../06-advanced/self-hosting.md).

## Node Daemon

The node daemon is the process started by `infernet start`. It does several things:

**Heartbeat loop** — every 30 seconds, the daemon sends a signed heartbeat to the control plane. The heartbeat includes: node public key, IP address, port, GPU stats, which models are currently loaded, and current load. If the control plane doesn't hear from a node for 90 seconds, it marks the node offline.

**Command polling** — on each heartbeat cycle, the daemon checks a command queue in the control plane. Commands include `model_install` (pull a new model) and `model_remove` (evict a model). Operators issue these commands from the dashboard or CLI; the daemon picks them up and executes them.

**Job execution** — when a job is routed to the node, the daemon receives it, calls the local inference backend, and streams the result back.

**Auth** — every request the daemon makes is signed with the node's secp256k1 private key. The signature covers the HTTP method, path, body hash, a nonce, and a timestamp. This is carried in the `X-Infernet-Auth` header. The control plane verifies the signature against the node's registered public key. The private key never leaves the node.

## Inference Backends

The daemon doesn't run inference itself. It delegates to one of five supported backends:

| Backend | Best for | Protocol |
|---------|----------|----------|
| Ollama | General use, easy setup | REST at `localhost:11434` |
| vLLM | High-throughput NVIDIA | OpenAI-compatible REST |
| SGLang | KV-cache reuse, structured output | OpenAI-compatible REST |
| Modular MAX | Throughput, modern NVIDIA | REST at configurable port |
| llama.cpp | CPU, Apple Silicon, GGUF models | REST via llama-swap |

The daemon probes each backend in priority order at startup and uses the first one that responds. You can override the selection with env vars.

## Job Flow

Here's what happens from the moment a client submits a job to the moment they receive the last token:

```
Client                 Control Plane              Node Daemon         Backend
  │                        │                          │                  │
  │  POST /api/v1/jobs      │                          │                  │
  │──────────────────────>  │                          │                  │
  │                        │  route to best node       │                  │
  │                        │─────────────────────────> │                  │
  │                        │                          │  POST /generate   │
  │                        │                          │─────────────────> │
  │  GET /api/v1/jobs/:id/stream                       │                  │
  │──────────────────────────────────────────────────> │                  │
  │                        │                          │ <── token chunk ──│
  │ <── SSE: {text:"..."}──────────────────────────── │                  │
  │ <── SSE: {text:"..."}──────────────────────────── │                  │
  │ <── SSE: [DONE] ───────────────────────────────── │                  │
  │                        │                          │                  │
  │                        │  job complete + CPR       │                  │
  │                        │ <───────────────────────  │                  │
```

The client can poll `GET /api/v1/jobs/:id` for status or open an SSE stream for real-time token delivery. Most applications use the stream.

## Key Design Decisions

**Supabase as the coordination layer** — not a custom blockchain. Job routing, node registry, and command queuing run on Postgres with real-time capabilities. This keeps latency low and the stack familiar. On-chain components handle only what needs to be on-chain: payment settlement.

**Nodes never trust the control plane with keys** — the secp256k1 auth model means the control plane can verify node identity without ever holding private keys. A compromised control plane cannot impersonate a node or steal earnings.

**Backends are swappable** — the daemon speaks to all backends through a thin adapter layer. Adding a new backend is a matter of implementing the adapter, not changing the protocol.

**SSE for streaming** — Server-Sent Events are simpler than WebSockets for unidirectional streaming and work through most proxies and CDNs without special configuration.
