# The Infernet Protocol Book

Infernet Protocol is a decentralized GPU compute network. Node operators register their GPU servers and get paid to run LLM inference. Developers submit jobs through a unified API and get responses back without depending on any single provider.

This book covers everything you need to know to run a node, build applications on the network, or understand how the protocol works under the hood.

---

## Who This Book Is For

**Node operators** who want to earn crypto by contributing GPU compute. You have an NVIDIA, AMD, or Apple Silicon machine and want to put it to work. Start with [Chapter 2: Node Operators](02-node-operators/index.md).

**Application developers** who want to call LLM inference without locking into OpenAI, Anthropic, or any other centralized provider. You want reliable APIs, streaming responses, and predictable costs. Start with [Chapter 4: Building Apps](04-building-apps/index.md).

**Protocol contributors** interested in the cryptographic architecture, payment flows, and key hierarchy. Start with [Chapter 5: Protocol](05-protocol/index.md).

If you're new to Infernet entirely, read [Chapter 1: Introduction](01-introduction/index.md) first.

---

## What You'll Learn

**Chapter 1 — Introduction**
What Infernet Protocol is, the problem it solves, and a high-level architecture tour. Includes a 5-minute quickstart so you can see the system working before diving into details.

**Chapter 2 — Node Operators**
Hardware requirements, the full installation walkthrough, model management, monitoring your node, and how earnings and payouts work.

**Chapter 3 — Inference Backends**
Ollama, vLLM, SGLang, Modular MAX, and llama.cpp. How each one works, when to use it, and how Infernet auto-selects between them.

**Chapter 4 — Building Apps**
The REST API, streaming chat with SSE, job lifecycle management, and error handling. JavaScript and Python examples throughout.

**Chapter 5 — Protocol Internals**
The Nostr-style secp256k1 auth system, Compute Payment Receipts, multi-chain wallet support, and the IPIP-0028 model key hierarchy.

**Chapter 6 — Advanced Topics**
Multi-GPU setups with vLLM and Ray, self-hosting the control plane, and the distributed training roadmap.

---

## Quick Reference

| Task | Where to look |
|------|--------------|
| Install a node | [02-node-operators/installation.md](02-node-operators/installation.md) |
| Pick an inference backend | [03-inference-backends/choosing.md](03-inference-backends/choosing.md) |
| Stream tokens from the API | [04-building-apps/streaming-chat.md](04-building-apps/streaming-chat.md) |
| Understand auth headers | [05-protocol/security.md](05-protocol/security.md) |
| Run a 70B model on 2 GPUs | [06-advanced/multi-gpu.md](06-advanced/multi-gpu.md) |

---

## Running the Examples

Most code examples in this book assume:

- `INFERNET_NODE_URL` points to your node (e.g. `http://localhost:3000`)
- `INFERNET_BEARER_TOKEN` is set with a valid bearer token from your control plane

```bash
export INFERNET_NODE_URL=http://localhost:3000
export INFERNET_BEARER_TOKEN=your_token_here
```

For the CLI examples, `infernet` must be installed and on your PATH. See [installation](02-node-operators/installation.md) if it isn't.

---

## Contributing

This book is open source and lives in `docs/book/` in the main Infernet Protocol repository. Pull requests are welcome. Corrections, new examples, and translations are especially appreciated.
