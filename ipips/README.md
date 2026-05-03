# Infernet Protocol Improvement Proposals (IPIPs)

An **IPIP** is a design document that proposes a change to the Infernet
Protocol or to its surrounding processes. It is the canonical record of
what we are building, why, and how it will work — modeled on Bitcoin's
[BIPs](https://github.com/bitcoin/bips), Ethereum's
[EIPs](https://eips.ethereum.org), and Lightning's
[BOLTs](https://github.com/lightning/bolts).

If you find yourself writing more than a paragraph in a Discord thread
about how something *should* work, that's an IPIP.

## When to write one

Write an IPIP when you want to:

- **Change the protocol on the wire** — signed-request envelope, payment
  flows, control-plane API contract, P2P transport, anything two
  independent implementations would need to agree on.
- **Change a public surface** — CLI command shape, daemon IPC, SDK
  contract, the engine plugin interface.
- **Lock in a non-obvious architectural decision** — so future
  contributors don't relitigate it from scratch six months later.
- **Track a multi-PR initiative** — release scope, migration plan, scope
  of a security review.

You **don't** need an IPIP for routine bug fixes, small refactors, doc
edits, dependency bumps, or anything that doesn't change a contract.
Just open a PR.

## Types

| Type            | What it covers                                                                |
| --------------- | ----------------------------------------------------------------------------- |
| **Standards Track** | Wire-protocol or public-API changes. Two implementations must agree.       |
| **Informational**   | Design notes, architectural rationale. No required behavior.               |
| **Process**         | Meta-proposals about the project: governance, this very document, releases.|

## Statuses

```
   Draft
     │
     ▼
  Proposed ──► Withdrawn
     │
     ▼
   Active ──► Replaced
     │
     ▼
   Final
```

| Status        | Meaning                                                                  |
| ------------- | ------------------------------------------------------------------------ |
| **Draft**     | Author writing. Not yet ready for community review.                      |
| **Proposed**  | Open for discussion. May still change substantially.                     |
| **Active**    | Accepted. Implementations should follow it.                              |
| **Final**     | Implemented and deployed in a tagged release. Frozen — supersede with a new IPIP. |
| **Withdrawn** | Author abandoned. Kept in the tree for history.                          |
| **Replaced**  | Superseded by a later IPIP. The replacement is named in the preamble.    |
| **Rejected**  | Closed without acceptance. Kept so the rationale doesn't get re-tried.   |

## Lifecycle

1. **Discuss informally first.** Open a GitHub Discussion, file an issue,
   or raise it in chat. If the idea survives that, write it up.
2. **Open a PR** adding `ipips/ipip-XXXX.md`. Pick the next free
   number. Use [`ipip-template.md`](./ipip-template.md) as the starting
   point. Status: `Draft`.
3. **Editor review** — a maintainer checks structure, completeness, and
   that you've covered backwards compatibility + a test plan. They may
   ask for revisions or move the status to `Proposed` and merge.
4. **Community review** — discussion happens on the PR or a linked
   issue. Substantive changes happen in follow-up commits. The IPIP
   stays in the tree as `Draft` or `Proposed` while this happens.
5. **Acceptance** — once consensus is reached, a maintainer flips the
   status to `Active` and the implementation work proceeds (often in
   separate PRs that reference the IPIP number).
6. **Finalization** — once the implementation is in a tagged release
   and known to be stable, status moves to `Final`.

A **Standards Track** IPIP that touches the wire protocol bumps the
version of the affected schema (e.g., the v1 NDJSON engine protocol in
`packages/engine/src/protocol.js`). Two-step migration plans go in the
IPIP itself.

## File layout

```
ipips/
├── README.md           ← you are here
├── ipip-template.md    ← copy this when starting a new one
├── ipip-0001.md        ← Infernet v1.0 Launch Criteria
└── ipip-XXXX.md        ← yours
```

- File name: `ipip-NNNN.md`, four-digit zero-padded number, lowercase.
- One IPIP per file. Don't put two unrelated changes in one document —
  split them.
- Numbers are assigned by the editor at merge time. Until then, use the
  next obviously-free number in your branch.

## Preamble

Every IPIP starts with a YAML block:

```yaml
---
ipip: 0001
title: Infernet v1.0 Launch Criteria
author: Anthony Ettinger <anthony@profullstack.com>
status: Draft
type: Process
created: 2026-04-26
discussion: https://github.com/infernetprotocol/infernet-protocol/issues/...
requires: []
replaces: []
---
```

`requires` and `replaces` are arrays of IPIP numbers. `discussion` links
to the canonical conversation thread.

## How to submit

1. Fork or branch the repo.
2. Copy [`ipip-template.md`](./ipip-template.md) → `ipip-XXXX.md`.
3. Fill in every section. "N/A" is fine if a section truly doesn't apply
   — but say *why* it doesn't apply.
4. Open a PR. Title: `IPIP-XXXX: <Title>`.
5. Be willing to revise. An IPIP that lands in `Draft` and never gets
   touched again will be closed as `Withdrawn` after a few months.

## Index

| #     | Title                              | Type            | Status |
| ----- | ---------------------------------- | --------------- | ------ |
| 0001  | [Infernet v1.0 Launch Criteria](./ipip-0001.md) | Process         | Active |
| 0002  | [Operator-to-Operator P2P Chat](./ipip-0002.md) | Standards Track | Active |
| 0003  | [Authentication & Account Model](./ipip-0003.md) | Standards Track | Final  |
| 0004  | [Multi-currency Payments via CoinPayPortal](./ipip-0004.md) | Standards Track | Active |
| 0005  | [Data Access Architecture](./ipip-0005.md) | Standards Track | Final  |
| 0006  | [Peer Discovery and Bootstrap](./ipip-0006.md) | Standards Track | Active |
| 0007  | [CoinPay Reputation Protocol Integration](./ipip-0007.md) | Standards Track | Final  |
| 0008  | [Hardware capability advertisement (NVLink / xGMI / IB / EFA)](./ipip-0008.md) | Standards Track | Active |
| 0009  | [Inference Engine Adapter Protocol](./ipip-0009.md) | Standards Track | Final  |
| 0010  | [Workload Classes (A / B / B.5 / C)](./ipip-0010.md) | Informational   | Active |
| 0011  | [Training Adapter Protocol](./ipip-0011.md) | Standards Track | Active |
| 0012  | [Federated Model Hosting (Pipeline-Parallel via Petals)](./ipip-0012.md) | Standards Track | Active |
| 0013  | [Batch Inference Job Decomposition](./ipip-0013.md) | Standards Track | Final  |
| 0014  | [Distributed-Systems Primitives](./ipip-0014.md) | Standards Track | Final  |
| 0015  | [Causal Ordering Across Providers](./ipip-0015.md) | Standards Track | Draft  |
| 0016  | [DHT-Based Decentralized Discovery](./ipip-0016.md) | Standards Track | Replaced |
| 0017  | [Replicated State Convergence (CRDTs)](./ipip-0017.md) | Standards Track | Draft  |
| 0018  | [Causal Broadcast for Cross-Provider Events](./ipip-0018.md) | Standards Track | Draft  |
| 0019  | [Pricing-Aware GPU Provider Deployments](./ipip-0019.md) | Standards Track | Final  |
| 0020  | [Consensus Primitives — When and How](./ipip-0020.md) | Informational   | Active |
| 0021  | [Protocol IDL — Wire Contracts and RMI](./ipip-0021.md) | Standards Track | Active |
| 0022  | [Host AI Runtime Detection + OpenVINO Engine](./ipip-0022.md) | Standards Track | Active |
| 0023  | [Distributed Training + Custom Model Pipeline](./ipip-0023.md) | Standards Track | Active |
| 0024  | [Token-Chunk Batching for P2P Chat Streaming](./ipip-0024.md) | Standards Track | Final  |
| 0025  | [Message Privacy — Encrypt Prompts and Responses at Rest](./ipip-0025.md) | Standards Track | Final  |
| 0026  | [Prompt Privacy — Secret Detection, Trusted Providers, TEE](./ipip-0026.md) | Standards Track | Active |
| 0027  | [End-to-End Prompt Encryption via NIP-44 ECDH](./ipip-0027.md) | Standards Track | Active |
| 0028  | [Multi-Party Encryption — Model / Node / Consumer Keys](./ipip-0028.md) | Standards Track | Active |
| 0030  | [Open-Market Distributed Training](./ipip-0030.md) | Standards Track | Final  |
| 0031  | [Federated Inference via Petals](./ipip-0031.md) | Standards Track | Replaced |
| 0032  | [Hyperswarm DHT — Topic-Keyed Peer Discovery](./ipip-0032.md) | Standards Track | Draft  |
| 0033  | [Federated Inference via llama.cpp RPC over Hyperswarm](./ipip-0033.md) | Standards Track | Active |

## Editors

The current IPIP editors are repository maintainers. They handle number
assignment, structural review, and status transitions. They are *not*
arbiters of whether a proposal is a good idea — that's the community's
call.

## Copyright

Each IPIP carries its own copyright notice in its preamble. Default for
this repo is Public Domain (CC0); authors may pick MIT or another OSI
license if preferred.
