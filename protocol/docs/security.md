# Protocol security

Defense-in-depth across every wire format in this directory.

## The signed envelope

Every protobuf message defined here travels inside a Nostr-signed
envelope (per [IPIP-0003](../../ipips/ipip-0003.md)).

```mermaid
flowchart LR
    Msg[protobuf payload]
    Env[envelope: pubkey, ts, nonce, sig over METHOD+path+ts+nonce+sha256(payload)]
    Wire[libp2p stream]
    Verify[verify signature, replay check]
    Decode[decode protobuf]
    Handler[application handler]

    Msg --> Env --> Wire
    Wire --> Verify --> Decode --> Handler
```

**Receivers verify the envelope BEFORE decoding the protobuf
payload.** A malformed payload should never reach decode logic on
the strength of an unverified envelope alone.

## Replay defense

Each envelope carries `timestamp_unix` and `nonce`. Receivers maintain
a per-process bloom-or-LRU cache of recently-seen nonces; envelopes
with timestamps outside ±60s OR with nonces seen before in the
current window are rejected.

Per IPIP-0014 §1, requests to state-mutating endpoints additionally
carry an `X-Idempotency-Key` (or its protobuf equivalent — `request_id`
on RmiRequest) for application-layer idempotency.

## Rate limits

| Surface | Default cap |
|---|---|
| Handshake attempts per source IP | 30 / minute |
| `FindPeers` per source peer | 10 / minute |
| `FindValue` per source peer | 60 / minute |
| `PutValue` per source peer | 100 / hour |
| `Publish` (gossip) per topic per peer | 10 / second |
| `SubmitJob` per source peer | 30 / minute |
| `RmiRequest` per (peer, object) | 60 / minute |

Operators may tune via daemon config; the defaults are
conservative starting points.

## Decode-bomb defense

Generated decoders MUST refuse messages exceeding a configurable
size cap (default **1 MiB** per envelope; gossip payloads tighter
at **256 KiB**). This prevents memory-exhaustion attacks via
massive nested fields.

## Method allowlists (RMI)

Server skeletons MUST keep an explicit allowlist of method names
permitted per object type. Reflection or `eval`-equivalent paths
are forbidden — the allowlist is the gate.

## Object reference forgery

`ObjectRef` records in the DHT are signed by the owner pubkey.
A client receiving an `ObjectRef` MUST verify the signing pubkey
matches `owner_peer_id` and that the record hasn't expired. A
peer fabricating ObjectRefs gets caught at signature verification
and loses reputation per IPIP-0007.

## Untrusted input boundary

Peer input is untrusted by default. Specifically:

- ❌ Don't pass peer-supplied strings to file-system paths
- ❌ Don't pass peer-supplied bytes to language-specific
  deserialization (Pickle, Java serialization, etc.) — only protobuf
- ❌ Don't trust `peer_id` fields claimed inside a payload — the
  authoritative identity is the envelope's signing pubkey
- ❌ Don't use peer-supplied data in shell command construction

## Protocol downgrade attacks

A man-in-the-middle that strips `supported_protocols` entries
during handshake forces both peers to negotiate a weaker common
version. Mitigation:

- Handshake envelopes are signed end-to-end (libp2p's secure
  channel + our envelope sig) — MITM modification breaks both
- Operators may pin a minimum version via
  `INFERNET_MIN_PROTOCOL_VERSION` env var; offers below the floor
  are rejected even if technically negotiable

## Disclosure

Vulnerability reports go to `security@infernetprotocol.com`.
Standard 90-day responsible-disclosure window before public
write-up.
