# Security Model

## The Problem with API Keys

Traditional node auth uses API keys: the server has a key, the client provides it in a header, the server checks if it matches. This works, but it requires the server to store secrets. If the control plane is breached, all node keys are compromised.

Infernet Protocol uses a different approach: **each node has a secp256k1 keypair, and every request is signed with the private key**. The control plane stores only public keys. Verifying a request requires only the public key and the signature — no secrets are stored anywhere except on the node itself.

This is the same cryptographic foundation used by Nostr (hence "Nostr-style"), Bitcoin, and Ethereum. The security properties are well-understood.

## Keypair Generation

When you run `infernet setup`, a secp256k1 keypair is generated for your node:

```
Private key (hex): stored in ~/.infernet/keys/node.key (mode 600)
Public key (hex):  registered with the control plane
```

The public key is derived deterministically from the private key. The private key never leaves your machine.

In Nostr notation:
```
Private key: nsec1...  (bech32-encoded private key)
Public key:  npub1...  (bech32-encoded public key)
```

You can view your node's public key:

```bash
infernet status | grep "Public key"
# Public key: npub1abc123def456...
```

## The X-Infernet-Auth Header

Every request the daemon makes to the control plane carries an `X-Infernet-Auth` header. This header contains a signed proof that the request was made by the holder of the private key.

Format:

```
X-Infernet-Auth: v1.<signature>.<nonce>.<timestamp>
```

Where:
- `v1` — protocol version
- `<signature>` — hex-encoded Schnorr signature
- `<nonce>` — 16-byte random hex value, unique per request
- `<timestamp>` — Unix timestamp in seconds

### What's Signed

The signature covers:

```
message = SHA256(
  method           +  // "POST"
  "\n"             +
  path             +  // "/api/v1/heartbeat"
  "\n"             +
  body_sha256      +  // SHA256 of request body, or empty string
  "\n"             +
  nonce            +  // same nonce as in header
  "\n"             +
  timestamp           // same timestamp as in header
)
```

All fields are UTF-8 encoded and concatenated with newlines before hashing.

### Why This Design

**Replay prevention**: The nonce is unique per request. The control plane keeps a short-lived nonce cache (5 minutes). A replayed request with the same nonce is rejected.

**Timestamp binding**: Requests more than 30 seconds old are rejected. This prevents replays even if the nonce cache doesn't have the nonce.

**Body integrity**: The body hash prevents anyone from modifying the request body in transit.

**Method + path binding**: The signature covers the full endpoint, not just the body. A valid signature for a `GET /heartbeat` cannot be replayed as a `POST /jobs`.

### Verification on the Control Plane

When the control plane receives a request:

1. Parse the `X-Infernet-Auth` header
2. Check that `timestamp` is within ±30 seconds of current time
3. Check that `nonce` hasn't been seen recently
4. Retrieve the node's registered public key (using `node_id` from the request body or URL)
5. Reconstruct the signed message from the request method, path, body, nonce, and timestamp
6. Verify the Schnorr signature against the public key
7. Cache the nonce for 5 minutes

If any step fails, the request is rejected with HTTP 401.

### Client API Tokens vs Node Auth

Note that **client developers use bearer tokens** from the dashboard — not secp256k1 keys. The secp256k1 auth is only for node-to-control-plane communication. Clients authenticate with standard bearer tokens because:

- Clients don't have persistent identities that need cryptographic proof
- Bearer tokens are simpler for developers to use
- Rate limiting and billing are account-level concerns, not key-level

If you want your application to have Nostr-style auth, that's possible but requires a custom integration — contact the team.

## What This Means in Practice

**The control plane cannot impersonate a node.** Even if an attacker gains full control of the control plane database, they cannot forge a signed request from any node because they don't have the private keys.

**Compromising the control plane doesn't steal earnings.** CPRs are signed by node keys. Fake CPRs without valid node signatures are rejected by the on-chain payment contract.

**Node operators control their own identity.** The public key is the node's canonical identity on the network. Rotating to a new keypair requires re-registration (new node ID), but the operator's history and reputation can be migrated if the old key signs a migration message.

## Key Storage

The private key is stored in `~/.infernet/keys/node.key` with file permissions `600` (owner read/write only). On Linux, this means only the process running as the same user can read it.

Best practices:

1. **Don't run the daemon as root.** Create a dedicated `infernet` user and run the daemon as that user.
2. **Backup your key.** If you lose it, you can't claim pending earnings and must re-register.
3. **Use disk encryption.** If your machine is physically compromised, full-disk encryption (LUKS on Linux) protects the key at rest.
4. **Keep the key off cloud storage.** Don't back it up to S3, GitHub, or anything synced.

To back up securely:

```bash
# Encrypt with a passphrase before storing anywhere
gpg --symmetric --cipher-algo AES256 ~/.infernet/keys/node.key
# Stores as ~/.infernet/keys/node.key.gpg
```
