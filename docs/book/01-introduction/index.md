# Chapter 1: Introduction

This chapter explains what Infernet Protocol is, why it exists, and how the pieces fit together. By the end you'll have a mental model of the whole system and a working node (or API call) to prove it.

---

## In This Chapter

- [What Is Infernet Protocol?](what-is-infernet.md) — The problem with centralized AI and how a decentralized compute network solves it.
- [Architecture](architecture.md) — Control plane, node daemon, inference engines, and the job flow from request to payment.
- [Quick Start](quick-start.md) — Install the CLI, run setup, and verify your node is online in under 5 minutes.

---

## The Core Idea in One Paragraph

Anyone with a GPU can run a node. Anyone who needs LLM inference submits a job. The network routes the job to an available node with the right model loaded, the node runs inference and streams back the result, and the client's payment is settled on-chain. No single company controls routing, pricing, or what models are available. The cryptographic auth layer means nodes never need to trust the control plane with private keys.
