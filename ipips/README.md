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
discussion: https://github.com/profullstack/infernet-protocol/issues/...
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

| #     | Title                              | Type     | Status |
| ----- | ---------------------------------- | -------- | ------ |
| 0001  | [Infernet v1.0 Launch Criteria](./ipip-0001.md) | Process  | Draft  |

## Editors

The current IPIP editors are repository maintainers. They handle number
assignment, structural review, and status transitions. They are *not*
arbiters of whether a proposal is a good idea — that's the community's
call.

## Copyright

Each IPIP carries its own copyright notice in its preamble. Default for
this repo is Public Domain (CC0); authors may pick MIT or another OSI
license if preferred.
