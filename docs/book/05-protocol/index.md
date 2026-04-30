# Chapter 5: Protocol Internals

This chapter covers the cryptographic and economic primitives that make Infernet Protocol work without central trust.

---

## In This Chapter

- [Security](security.md) — Nostr-style secp256k1 keypairs, the `X-Infernet-Auth` header, what gets signed and why, and what it means for nodes to not require API keys.
- [Payments](payments.md) — Compute Payment Receipts (CPRs), multi-chain wallet support, the payment flow from job completion to on-chain settlement.
- [Nostr Keys](nostr-keys.md) — The three-party key hierarchy (IPIP-0028): user keys, node keys, and per-model keys. How they're generated, stored, and rotated.

---

## Design Philosophy

Infernet Protocol's protocol layer is built around two principles:

**Minimize trust surface.** The control plane coordinates but doesn't hold private keys, custody funds, or have the ability to impersonate nodes. If the control plane is compromised, attackers can disrupt routing but cannot steal keys or earnings.

**Crypto-native from the start.** Rather than retrofitting blockchain payments onto a traditional API model, payments and identity are cryptographic primitives built into the protocol. Every node is identified by its public key. Every job completion generates a signed receipt. Every payout is an on-chain redemption of that receipt.

These choices add some complexity compared to a simple API key + centralized billing model, but they're what make the protocol genuinely decentralized.
